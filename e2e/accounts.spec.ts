import { expect, test } from '@playwright/test';
import { approvedCustomer, evidence, KEYCLOAK, signIn } from './support';

test('a customer funds the account and replays it from its events', async ({ page, request }, testInfo) => {
  const customer = await approvedCustomer(request, 'Marina', 'Costa');
  await signIn(page, customer.email, customer.password);
  await expect(page).toHaveURL(/\/accounts$/);
  await page.getByRole('link', { name: /BRL account/ }).click();

  await test.step('deposit and withdraw, each one a new event', async () => {
    await page.getByLabel('Amount in BRL').fill('1000');
    await page.getByRole('button', { name: 'Deposit' }).click();
    await expect(page.getByRole('status')).toContainText(/Saved as version 2\. The read model caught up \d+ ms later\./);
    await page.getByLabel('Amount in BRL').fill('250.75');
    await page.getByRole('button', { name: 'Withdraw' }).click();
    await expect(page.getByLabel('Balance')).toHaveText('BRL 749.25');
    await expect(page.locator('.stream-type')).toHaveText(['AccountOpened', 'FundsDeposited', 'FundsWithdrawn']);
    await evidence(page, testInfo, '01 statement and event stream');
  });

  await test.step('the aggregate refuses to overdraw', async () => {
    await page.getByLabel('Amount in BRL').fill('5000');
    await page.getByRole('button', { name: 'Withdraw' }).click();
    await expect(page.getByRole('alert')).toHaveText('The balance does not cover this amount.');
    await expect(page.locator('.stream-type')).toHaveCount(3);
    await evidence(page, testInfo, '02 overdraft refused, no event recorded');
  });

  await test.step('replay to version 2', async () => {
    await page.getByRole('slider').fill('2');
    await expect(page.locator('.replay-result')).toHaveText('Balance then BRL 1,000.00, open');
    await evidence(page, testInfo, '03 replayed to version 2');
  });

  await test.step('open a second account in dollars', async () => {
    await page.getByRole('link', { name: 'Accounts', exact: true }).first().click();
    await page.getByLabel('Currency').selectOption('USD');
    await page.getByRole('button', { name: 'Open account' }).click();
    await expect(page.getByRole('status')).toContainText('Saved as version 1');
    await expect(page.getByRole('link', { name: /USD account/ })).toBeVisible();
    await evidence(page, testInfo, '04 a second account, in the name of the approved customer');
  });

  await test.step('signing out ends the session in Keycloak too', async () => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Banking built on events.' })).toBeVisible();
    await page.goto('/accounts');
    await page.waitForURL(`${KEYCLOAK}/**`);
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await evidence(page, testInfo, '05 after signing out, the account asks for a password again');
  });
});
