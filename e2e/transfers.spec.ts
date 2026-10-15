import { expect, test } from '@playwright/test';
import {
  closeAccount,
  deposit,
  evidence,
  holder,
  openAccount,
  requestTransfer,
  waitUntilTransfersKnow,
} from './support';

function transferRow(page: import('@playwright/test').Page, source: string, destination: string) {
  return page.getByRole('button', { name: new RegExp(`${source}\\s+to\\s+${destination}`) });
}

test('a transfer runs the saga to completion', async ({ page, request }, testInfo) => {
  const source = holder('Igor Mendes');
  const destination = holder('Julia Rocha');
  const sourceId = await openAccount(request, source);
  const destinationId = await openAccount(request, destination);
  await deposit(request, sourceId, 1000);
  await waitUntilTransfersKnow(request, sourceId, destinationId);

  await test.step('send the transfer from the form', async () => {
    await page.goto('/transfers');
    await page.getByLabel('From').selectOption(sourceId);
    await page.getByLabel('To').selectOption(destinationId);
    await page.getByLabel(/Amount/).fill('320');
    await page.getByRole('button', { name: 'Send transfer' }).click();
    await expect(page.getByRole('status')).toContainText('Transfer requested.');
  });

  await test.step('follow the saga until the credit lands', async () => {
    const row = transferRow(page, source, destination);
    await row.click();
    await expect(row).toContainText('Completed');

    const steps = page.getByRole('list', { name: 'Saga steps' }).getByRole('listitem');
    await expect(steps).toHaveText([`Requested by ${source}`, `Debited from ${source}`, `Credited to ${destination}`]);
    await expect(page.locator('.transfer-detail .stream-type')).toHaveText([
      'TransferRequested',
      'TransferDebited',
      'TransferCompleted',
    ]);
    await evidence(page, testInfo, '01 saga completed: debit, credit, done');
  });

  await test.step('both balances moved', async () => {
    await page.goto(`/accounts/${sourceId}`);
    await expect(page.getByLabel('Balance')).toHaveText('BRL 680.00');
    await expect(page.locator('.stream-type').last()).toHaveText('TransferDebited');
    await evidence(page, testInfo, '02 source account: TransferDebited');

    await page.goto(`/accounts/${destinationId}`);
    await expect(page.getByLabel('Balance')).toHaveText('BRL 320.00');
    await expect(page.locator('.stream-type').last()).toHaveText('TransferCredited');
    await evidence(page, testInfo, '03 destination account: TransferCredited');
  });
});

test('a transfer without funds is declined by the source account', async ({ page, request }, testInfo) => {
  const source = holder('Karen Lopes');
  const destination = holder('Lucas Faria');
  const sourceId = await openAccount(request, source);
  const destinationId = await openAccount(request, destination);
  await deposit(request, sourceId, 50);
  await waitUntilTransfersKnow(request, sourceId, destinationId);

  await requestTransfer(request, sourceId, destinationId, 900);

  await page.goto('/transfers');
  const row = transferRow(page, source, destination);
  await row.click();
  await expect(row).toContainText('Failed');
  await expect(page.getByRole('list', { name: 'Saga steps' }).getByRole('listitem')).toHaveText([
    `Requested by ${source}`,
    'Debit declined: insufficient funds',
  ]);
  await evidence(page, testInfo, '01 saga failed: the source declined the debit');

  await page.goto(`/accounts/${sourceId}`);
  await expect(page.getByLabel('Balance')).toHaveText('BRL 50.00');
  await expect(page.getByRole('table')).toContainText('Transfer declined: insufficient funds');
  await expect(page.locator('.stream-type').last()).toHaveText('TransferDebitDeclined');
  await evidence(page, testInfo, '02 the decline is a recorded fact, the balance is untouched');
});

test('a transfer to an account closed mid-saga is refunded', async ({ page, request }, testInfo) => {
  const source = holder('Marina Costa');
  const destination = holder('Nelson Dias');
  const sourceId = await openAccount(request, source);
  const destinationId = await openAccount(request, destination);
  await deposit(request, sourceId, 400);
  await waitUntilTransfersKnow(request, sourceId, destinationId);

  await requestTransfer(request, sourceId, destinationId, 150);
  await closeAccount(request, destinationId);

  await page.goto('/transfers');
  const row = transferRow(page, source, destination);
  await row.click();
  await expect(row).toContainText('Reversed');
  await expect(page.getByRole('list', { name: 'Saga steps' }).getByRole('listitem')).toHaveText([
    `Requested by ${source}`,
    `Debited from ${source}`,
    'Credit declined: account closed',
    `Refunded to ${source}`,
  ]);
  await expect(page.locator('.transfer-detail .stream-type')).toHaveText([
    'TransferRequested',
    'TransferDebited',
    'TransferCreditDeclined',
    'TransferReversed',
  ]);
  await evidence(page, testInfo, '01 saga compensated: credit declined, source refunded');

  await page.goto(`/accounts/${sourceId}`);
  await expect(page.getByLabel('Balance')).toHaveText('BRL 400.00');
  await expect(page.locator('.stream-type')).toHaveText([
    'AccountOpened',
    'FundsDeposited',
    'TransferDebited',
    'TransferRefunded',
  ]);
  await evidence(page, testInfo, '02 source account: debited then refunded, balance restored');
});
