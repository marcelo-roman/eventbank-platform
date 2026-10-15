import { expect, test } from '@playwright/test';
import { deposit, evidence, holder, openAccount } from './support';

test('a read model is rebuilt from the event store', async ({ page, request }, testInfo) => {
  const name = holder('Otavio Reis');
  const accountId = await openAccount(request, name);
  await deposit(request, accountId, 1234.5);

  const accounts = page.getByRole('region', { name: 'Accounts service' });
  const readModels = accounts.getByRole('listitem').filter({ hasText: 'read-models' });

  await page.goto('/projections');
  await expect(readModels).toContainText('Caught up');
  await evidence(page, testInfo, '01 subscriptions caught up with the event store');

  await readModels.getByRole('button', { name: 'Rebuild from events' }).click();
  await expect(readModels.getByRole('button', { name: 'Rebuild from events' })).toBeVisible();
  await expect(readModels).toContainText('Caught up');
  await evidence(page, testInfo, '02 read models dropped and replayed from the first event');

  await page.getByRole('link', { name: 'Accounts', exact: true }).click();
  await expect(page.getByRole('link', { name: new RegExp(name) })).toContainText('BRL 1,234.50');
  await evidence(page, testInfo, '03 rebuilt read model serves the same balances');
});
