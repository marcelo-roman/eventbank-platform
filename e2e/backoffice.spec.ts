import { expect, test } from '@playwright/test';
import { api, approvedCustomer, evidence, KEYCLOAK, operatorPage, signIn, uniqueEmail, userToken, validCpf } from './support';

test('an operator rejects an application and the customer reads why', async ({ page, browser, request, baseURL }, testInfo) => {
  const email = uniqueEmail('igor');
  const adminToken = ((await (await request.post(`${KEYCLOAK}/realms/master/protocol/openid-connect/token`, { form: { grant_type: 'password', client_id: 'admin-cli', username: 'admin', password: 'admin' } })).json()) as { access_token: string }).access_token;
  await request.post(`${KEYCLOAK}/admin/realms/eventbank/users`, {
    headers: { authorization: `Bearer ${adminToken}` },
    data: { username: email, email, firstName: 'Igor', lastName: 'Mendes', enabled: true, emailVerified: true, credentials: [{ type: 'password', value: 'igor-pass-123', temporary: false }] },
  });
  const token = await userToken(request, email, 'igor-pass-123');
  await api(request, token, 'POST', '/customers/me', { fullName: 'Igor Mendes', cpf: validCpf(), birthDate: '1985-07-01', phone: '11912340000' });

  const operator = await operatorPage(browser, baseURL!);
  const application = operator.getByRole('listitem').filter({ hasText: email });
  await application.getByRole('button', { name: 'Reject' }).click();
  await application.getByLabel('Reason the customer will read').fill('The document photo is unreadable');
  await evidence(operator, testInfo, '01 operator writes the reason');
  await application.getByRole('button', { name: 'Reject application' }).click();
  await expect(application).toBeHidden();
  await operator.getByRole('tab', { name: 'Customers' }).click();
  await expect(operator.getByRole('row').filter({ hasText: email })).toContainText('The document photo is unreadable');
  await evidence(operator, testInfo, '02 the customer list shows the rejection');
  await operator.context().close();

  await signIn(page, email, 'igor-pass-123');
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByText('Not approved')).toBeVisible();
  await expect(page.getByText('The document photo is unreadable')).toBeVisible();
  await evidence(page, testInfo, '03 the customer sees the reason');
});

test('each profile only reaches its own areas', async ({ page, browser, request, baseURL }, testInfo) => {
  const customer = await approvedCustomer(request, 'Julia', 'Rocha');
  const other = await approvedCustomer(request, 'Lucas', 'Faria');

  expect((await api(request, customer.token, 'GET', `/accounts/${other.accountId}`)).status).toBe(403);
  expect((await api(request, customer.token, 'GET', '/customers')).status).toBe(403);
  expect((await request.get('/api/accounts')).status()).toBe(401);

  await signIn(page, customer.email, customer.password);
  await page.goto('/backoffice');
  await expect(page.getByRole('alert')).toHaveText('This area is not available for your profile.');
  await evidence(page, testInfo, '01 a customer cannot open the back office');

  const operator = await operatorPage(browser, baseURL!);
  await operator.goto(`/accounts/${customer.accountId}`);
  await expect(operator.getByText('You are viewing this account as an operator. Only its owner can move money.')).toBeVisible();
  await expect(operator.getByRole('button', { name: 'Deposit' })).toHaveCount(0);
  await evidence(operator, testInfo, '02 an operator reads accounts but cannot move money');
  await operator.context().close();
});
