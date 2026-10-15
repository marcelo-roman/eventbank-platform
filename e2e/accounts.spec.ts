import { expect, test } from '@playwright/test';
import { evidence, holder } from './support';

test('an account is opened, funded and replayed from its events', async ({ page }, testInfo) => {
  const name = holder('Helena Prado');

  await test.step('open the account through the form and wait for the read model', async () => {
    await page.goto('/accounts');
    await page.getByLabel('Holder name').fill(name);
    await page.getByLabel('Currency').selectOption('BRL');
    await page.getByRole('button', { name: 'Open account' }).click();

    await expect(page.getByRole('status')).toContainText(/Saved as version 1\. The read model caught up \d+ ms later\./);
    await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();
    await evidence(page, testInfo, '01 account opened, read model caught up');
  });

  await test.step('deposit and withdraw, each one a new event', async () => {
    await page.getByRole('link', { name: 'View the new account' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

    await page.getByLabel('Amount in BRL').fill('1000');
    await page.getByRole('button', { name: 'Deposit' }).click();
    await expect(page.getByRole('status')).toContainText('Saved as version 2.');
    await expect(page.getByLabel('Balance')).toHaveText('BRL 1,000.00');

    await page.getByLabel('Amount in BRL').fill('250.75');
    await page.getByRole('button', { name: 'Withdraw' }).click();
    await expect(page.getByRole('status')).toContainText('Saved as version 3.');
    await expect(page.getByLabel('Balance')).toHaveText('BRL 749.25');

    const stream = page.locator('.stream-type');
    await expect(stream).toHaveText(['AccountOpened', 'FundsDeposited', 'FundsWithdrawn']);
    await expect(page.getByRole('table')).toContainText('Withdrawal');
    await evidence(page, testInfo, '02 statement and event stream after deposit and withdrawal');
  });

  await test.step('the aggregate refuses to overdraw', async () => {
    await page.getByLabel('Amount in BRL').fill('5000');
    await page.getByRole('button', { name: 'Withdraw' }).click();

    await expect(page.getByRole('alert')).toHaveText('The balance does not cover this amount.');
    await expect(page.getByLabel('Balance')).toHaveText('BRL 749.25');
    await expect(page.locator('.stream-type')).toHaveCount(3);
    await evidence(page, testInfo, '03 domain rule rejects the overdraft, no event recorded');
  });

  await test.step('replay the account to version 2', async () => {
    await page.getByRole('slider').fill('2');

    await expect(page.locator('.replay-result')).toHaveText('Balance then BRL 1,000.00, open');
    await expect(page.locator('.stream-event.future')).toHaveCount(1);
    await evidence(page, testInfo, '04 replayed to version 2: balance before the withdrawal');

    await page.getByRole('slider').fill('1');
    await expect(page.locator('.replay-result')).toHaveText('Balance then BRL 0.00, open');
    await evidence(page, testInfo, '05 replayed to version 1: just opened');
  });
});
