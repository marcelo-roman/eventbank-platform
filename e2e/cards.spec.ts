import { expect, test } from '@playwright/test';
import { approvedCustomer, deposit, emailsTo, evidence, signIn } from './support';

test('a virtual card respects its status and its daily limit', async ({ page, request }, testInfo) => {
  const customer = await approvedCustomer(request, 'Paula', 'Lima');
  await deposit(request, customer, 300);
  await signIn(page, customer.email, customer.password);
  await page.getByRole('link', { name: 'Cards', exact: true }).click();

  await test.step('request a card', async () => {
    await page.getByRole('button', { name: 'Request a virtual card' }).click();
    await expect(page.getByLabel(/Card ending in \d{4}/)).toContainText('Paula Lima');
    await evidence(page, testInfo, '01 card issued for the checking account');
  });

  const purchases = page.getByRole('list', { name: 'Purchases' });
  const pay = async (merchant: string, amount: string) => {
    await page.getByLabel('Merchant').fill(merchant);
    await page.getByLabel(/Amount in BRL/).fill(amount);
    await page.getByRole('button', { name: 'Pay with this card' }).click();
  };

  await test.step('a purchase is authorized, charged to the account and captured', async () => {
    await pay('Padaria Real', '42.90');
    await expect(purchases.getByRole('listitem').first()).toContainText('Approved');
    await expect(page.getByText(/Spent today\s+BRL\s42\.90/)).toBeVisible();
    await evidence(page, testInfo, '02 purchase approved, limit used');
  });

  await test.step('lowering the limit declines a purchase above it', async () => {
    await page.getByLabel(/Daily limit in BRL/).fill('100');
    await page.getByRole('button', { name: 'Save limit' }).click();
    await expect(page.getByText(/of\s+BRL\s100\.00/)).toBeVisible();
    await pay('Livraria', '80');
    await expect(purchases.getByRole('listitem').first()).toContainText('Declined: over the daily limit');
  });

  await test.step('a blocked card declines everything', async () => {
    await page.getByRole('button', { name: 'Block card' }).click();
    await expect(page.getByLabel(/Card ending in/)).toContainText('Blocked');
    await pay('Cafe', '5');
    await expect(purchases.getByRole('listitem').first()).toContainText('Declined: card blocked');
    await evidence(page, testInfo, '03 limit and block decline purchases');
  });

  await test.step('the account statement shows the captured purchase', async () => {
    await page.getByRole('link', { name: 'Accounts', exact: true }).click();
    await page.getByRole('link', { name: /BRL account/ }).click();
    await expect(page.getByLabel('Balance')).toHaveText('BRL 257.10');
    await expect(page.getByRole('table')).toContainText(/Card purchase, Card \d{4} at Padaria Real/);
    await evidence(page, testInfo, '04 the charge is an event of the account');
    await expect.poll(() => emailsTo(request, customer.email)).toEqual(
      expect.arrayContaining(['Card purchase at Padaria Real', 'Card purchase declined at Livraria', 'Card purchase declined at Cafe']),
    );
  });
});
