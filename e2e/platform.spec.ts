import { expect, test } from '@playwright/test';
import { approvedCustomer, evidence, operatorPage, signIn } from './support';

test('an operator rebuilds a read model from the event store', async ({ browser, request, baseURL }, testInfo) => {
  const customer = await approvedCustomer(request, 'Rafael', 'Nunes');
  const page = await operatorPage(browser, baseURL!);
  await page.getByRole('link', { name: 'Projections' }).click();

  const readModels = page.getByRole('region', { name: 'Accounts service' }).getByRole('listitem').filter({ hasText: 'read-models' });
  await expect(readModels).toContainText('Caught up');
  await readModels.getByRole('button', { name: 'Rebuild from events' }).click();
  await expect(readModels).toContainText('Caught up');
  await evidence(page, testInfo, '01 read models replayed from the first event');

  await page.getByRole('link', { name: 'Back office' }).click();
  await page.getByRole('tab', { name: 'Accounts' }).click();
  await expect(page.getByRole('row').filter({ has: page.locator(`a[href="/accounts/${customer.accountId}"]`) })).toContainText('Rafael Nunes');
  await evidence(page, testInfo, '02 accounts are back after the rebuild');
  await page.context().close();
});

test('each screen comes from its own remote, and one down does not take the others', async ({ page, request }, testInfo) => {
  const customer = await approvedCustomer(request, 'Sofia', 'Dias');
  const remotes = new Set<string>();
  page.on('response', (response) => {
    if (response.url().endsWith('/remoteEntry.js')) {
      remotes.add(new URL(response.url()).origin);
    }
  });

  await signIn(page, customer.email, customer.password);
  await page.getByRole('link', { name: 'PIX', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'PIX', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Cards', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cards', level: 1 })).toBeVisible();
  expect([...remotes].sort()).toEqual(['http://localhost:3001', 'http://localhost:3002', 'http://localhost:3005']);

  await page.route(/localhost:3002/, (route) => route.abort());
  await page.goto('/pix');
  await expect(page.getByRole('alert')).toContainText('PIX is unavailable right now.', { timeout: 30_000 });
  await evidence(page, testInfo, '01 the PIX remote is down, only its area says so');
  await page.getByRole('link', { name: 'Accounts', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your accounts' })).toBeVisible();
  await evidence(page, testInfo, '02 accounts keep working');
});
