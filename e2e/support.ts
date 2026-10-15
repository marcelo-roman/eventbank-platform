import { type APIRequestContext, type Browser, expect, type Page, type TestInfo } from '@playwright/test';

export const KEYCLOAK = process.env.KEYCLOAK_URL ?? 'http://localhost:8180';
export const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
export const OPERATOR = { email: 'operator@eventbank.local', password: 'operator123' };

const run = Date.now().toString(36).slice(-5);
let counter = 0;

export async function evidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
}

export function uniqueEmail(name: string): string {
  counter += 1;
  return `${name.toLowerCase()}.${run}${counter}@example.com`;
}

export function validCpf(): string {
  const body = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const check = (digits: number[]) => {
    const sum = digits.reduce((total, digit, index) => total + digit * (digits.length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  const first = check(body);
  const second = check([...body, first]);
  return [...body, first, second].join('');
}

async function adminToken(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${KEYCLOAK}/realms/master/protocol/openid-connect/token`, {
    form: { grant_type: 'password', client_id: 'admin-cli', username: 'admin', password: 'admin' },
  });
  return ((await response.json()) as { access_token: string }).access_token;
}

export async function userToken(request: APIRequestContext, email: string, password: string): Promise<string> {
  const response = await request.post(`${KEYCLOAK}/realms/eventbank/protocol/openid-connect/token`, {
    form: { grant_type: 'password', client_id: 'eventbank-cli', username: email, password, scope: 'openid' },
  });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { access_token: string }).access_token;
}

export async function api<T = unknown>(
  request: APIRequestContext,
  token: string,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  data?: unknown,
): Promise<{ status: number; body: T }> {
  const response = await request.fetch(`/api${path}`, { method, data, headers: { authorization: `Bearer ${token}` } });
  const text = await response.text();
  return { status: response.status(), body: (text ? JSON.parse(text) : undefined) as T };
}

export interface Customer {
  name: string;
  email: string;
  password: string;
  cpf: string;
  token: string;
  accountId: string;
}

export async function approvedCustomer(request: APIRequestContext, firstName: string, lastName: string): Promise<Customer> {
  const email = uniqueEmail(firstName);
  const password = `${firstName.toLowerCase()}-pass-123`;
  const created = await request.post(`${KEYCLOAK}/admin/realms/eventbank/users`, {
    headers: { authorization: `Bearer ${await adminToken(request)}` },
    data: {
      username: email,
      email,
      firstName,
      lastName,
      enabled: true,
      emailVerified: true,
      credentials: [{ type: 'password', value: password, temporary: false }],
    },
  });
  expect(created.status()).toBe(201);

  const token = await userToken(request, email, password);
  const cpf = validCpf();
  const name = `${firstName} ${lastName}`;
  expect((await api(request, token, 'POST', '/customers/me', { fullName: name, cpf, birthDate: '1990-04-12', phone: '11987654321' })).status).toBe(201);

  const operator = await userToken(request, OPERATOR.email, OPERATOR.password);
  const customerId = JSON.parse(atob(token.split('.')[1]!)).sub as string;
  await expect.poll(async () => (await api(request, operator, 'POST', `/customers/${customerId}/approve`)).status).toBe(200);

  let accountId = '';
  await expect
    .poll(async () => {
      const accounts = await api<{ id: string }[]>(request, token, 'GET', '/accounts');
      accountId = accounts.body[0]?.id ?? '';
      return accountId;
    })
    .not.toBe('');
  return { name, email, password, cpf, token, accountId };
}

export async function deposit(request: APIRequestContext, customer: Customer, amount: number): Promise<void> {
  const result = await api<{ version: number }>(request, customer.token, 'POST', `/accounts/${customer.accountId}/deposits`, { amount });
  expect(result.status).toBe(200);
  await expect
    .poll(async () => (await api<{ version: number }>(request, customer.token, 'GET', `/accounts/${customer.accountId}`)).body.version)
    .toBeGreaterThanOrEqual(result.body.version);
}

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  const app = new URL(page.url()).origin;
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.waitForURL(`${KEYCLOAK}/**`);
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('#kc-login, button[type="submit"]').first().click();
  await page.waitForURL((url) => url.origin === app && !url.pathname.startsWith('/callback'), { timeout: 20_000 });
}

export async function operatorPage(browser: Browser, baseURL: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  await signIn(page, OPERATOR.email, OPERATOR.password);
  return page;
}

interface MailpitMessage {
  ID: string;
  Subject: string;
}

export async function emailsTo(request: APIRequestContext, email: string): Promise<string[]> {
  const response = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  return ((await response.json()) as { messages: MailpitMessage[] }).messages.map((message) => message.Subject);
}

export async function verificationLink(request: APIRequestContext, email: string): Promise<string> {
  let link = '';
  await expect
    .poll(async () => {
      const search = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email} subject:"Verify email"`)}`);
      const message = ((await search.json()) as { messages: MailpitMessage[] }).messages[0];
      if (!message) {
        return '';
      }
      const detail = (await (await request.get(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as { Text: string };
      link = /https?:\/\/\S+action-token\S+/.exec(detail.Text)?.[0] ?? '';
      return link;
    })
    .not.toBe('');
  return link;
}
