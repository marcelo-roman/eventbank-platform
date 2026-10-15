import { expect, test } from '@playwright/test';
import { evidence } from './support';

test('each screen is a remote loaded from its own server', async ({ page }, testInfo) => {
  const remotes: string[] = [];
  page.on('response', (response) => {
    if (response.url().endsWith('/remoteEntry.js')) {
      remotes.push(new URL(response.url()).origin);
    }
  });

  await page.goto('/accounts');
  await expect(page.getByRole('heading', { name: 'Accounts', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Transfers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Transfers', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Projections', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Projections', level: 1 })).toBeVisible();

  expect(remotes).toEqual(['http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003']);
  await testInfo.attach('remote entries loaded', { body: remotes.join('\n'), contentType: 'text/plain' });
  await evidence(page, testInfo, '01 shell on :3000 with remotes from :3001, :3002 and :3003');
});

test('a remote that is down does not take the shell with it', async ({ page }, testInfo) => {
  await page.route(/localhost:3002/, (route) => route.abort());

  await page.goto('/transfers');
  await expect(page.getByRole('alert')).toHaveText(
    'Transfers is unavailable right now. The rest of EventBank keeps working; reload the page to try again.',
    { timeout: 30_000 },
  );
  await evidence(page, testInfo, '01 transfers remote unreachable, the shell shows it in place');

  await page.getByRole('link', { name: 'Accounts', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Accounts', level: 1 })).toBeVisible();
  await evidence(page, testInfo, '02 accounts remote keeps working');
});
