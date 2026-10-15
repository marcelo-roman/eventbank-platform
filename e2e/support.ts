import { type APIRequestContext, expect, type Page, type TestInfo } from '@playwright/test';

const run = Date.now().toString(36).slice(-5);

export function holder(name: string): string {
  return `${name} ${run}`;
}

export async function evidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
}

interface CommandResult {
  id: string;
  version: number;
}

export async function openAccount(request: APIRequestContext, name: string, currency = 'BRL'): Promise<string> {
  const response = await request.post('/api/accounts', { data: { holder: name, currency } });
  expect(response.status()).toBe(201);
  const result = (await response.json()) as CommandResult;
  await waitForReadModel(request, result);
  return result.id;
}

export async function deposit(request: APIRequestContext, accountId: string, amount: number): Promise<void> {
  const response = await request.post(`/api/accounts/${accountId}/deposits`, { data: { amount } });
  expect(response.ok()).toBeTruthy();
  await waitForReadModel(request, (await response.json()) as CommandResult);
}

export async function closeAccount(request: APIRequestContext, accountId: string): Promise<void> {
  const response = await request.post(`/api/accounts/${accountId}/close`);
  expect(response.ok()).toBeTruthy();
}

async function waitForReadModel(request: APIRequestContext, result: CommandResult): Promise<void> {
  await expect
    .poll(async () => {
      const response = await request.get(`/api/accounts/${result.id}`);
      return response.ok() ? ((await response.json()) as CommandResult).version : 0;
    })
    .toBeGreaterThanOrEqual(result.version);
}

export async function waitUntilTransfersKnow(request: APIRequestContext, ...accountIds: string[]): Promise<void> {
  const [source, destination] = accountIds;
  await expect
    .poll(async () => {
      const probe = await request.post('/api/transfers', {
        data: { sourceAccountId: source, destinationAccountId: destination, amount: 0.001 },
      });
      return probe.status();
    })
    .toBe(422);
}

export async function requestTransfer(
  request: APIRequestContext,
  sourceAccountId: string,
  destinationAccountId: string,
  amount: number,
): Promise<string> {
  const response = await request.post('/api/transfers', { data: { sourceAccountId, destinationAccountId, amount } });
  expect(response.status()).toBe(202);
  return ((await response.json()) as CommandResult).id;
}
