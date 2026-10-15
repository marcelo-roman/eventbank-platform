import { expect, test } from '@playwright/test';
import { api, approvedCustomer, deposit, emailsTo, evidence, signIn, validCpf } from './support';

test('a PIX by e-mail key moves money between two customers', async ({ page, browser, request, baseURL }, testInfo) => {
  const payer = await approvedCustomer(request, 'Nina', 'Alves');
  const payee = await approvedCustomer(request, 'Otavio', 'Reis');
  await deposit(request, payer, 500);

  await test.step('the payee registers an e-mail key', async () => {
    const context = await browser.newContext({ baseURL, viewport: { width: 1360, height: 900 } });
    const payeePage = await context.newPage();
    await signIn(payeePage, payee.email, payee.password);
    await payeePage.getByRole('link', { name: 'PIX', exact: true }).click();
    await payeePage.getByRole('tab', { name: 'Your keys' }).click();
    await payeePage.getByLabel('Key type').selectOption('Email');
    await payeePage.getByRole('button', { name: 'Register key' }).click();
    await expect(payeePage.locator('.key-row')).toContainText(payee.email);

    await payeePage.getByLabel('Key type').selectOption('Cpf');
    await payeePage.getByRole('button', { name: 'Register key' }).click();
    await expect(payeePage.locator('.key-row')).toHaveCount(2);
    await evidence(payeePage, testInfo, '01 payee registered e-mail and CPF keys');
    await context.close();
  });

  await test.step('a key belongs to one account, and a CPF key only to its holder', async () => {
    const taken = await api<{ code: string }>(request, payer.token, 'POST', '/pix/keys', { accountId: payer.accountId, type: 'Cpf', value: payee.cpf });
    expect(taken.body.code).toBe('pix_key_in_use');
    const notYours = await api<{ code: string }>(request, payer.token, 'POST', '/pix/keys', { accountId: payer.accountId, type: 'Cpf', value: validCpf() });
    expect(notYours.body.code).toBe('pix_key_not_yours');
  });

  await test.step('the payer looks up the key and sends a PIX', async () => {
    await signIn(page, payer.email, payer.password);
    await page.getByRole('link', { name: 'PIX', exact: true }).click();
    await page.getByLabel(/^Key/).fill(payee.email);
    await page.getByRole('button', { name: 'Look up key' }).click();
    const recipient = page.getByLabel('Recipient');
    await expect(recipient).toContainText('Otavio R.');
    await expect(recipient).toContainText(/o\*\*\*@example\.com/);
    await evidence(page, testInfo, '02 the key resolves to a masked recipient');
    await recipient.getByLabel(/Amount/).fill('120');
    await recipient.getByRole('button', { name: 'Send PIX to Otavio R.' }).click();

    const row = page.getByRole('button', { name: /Nina Alves\s+to\s+Otavio Reis/ });
    await row.click();
    await expect(row).toContainText('Completed');
    await expect(page.getByRole('list', { name: 'Saga steps' }).getByRole('listitem')).toHaveText([
      'Requested by Nina Alves',
      'Debited from Nina Alves',
      'Credited to Otavio Reis',
    ]);
    await evidence(page, testInfo, '03 PIX completed through the saga');
  });

  await test.step('both balances moved and both got an e-mail', async () => {
    const payerAccount = await api<{ balance: number }>(request, payer.token, 'GET', `/accounts/${payer.accountId}`);
    expect(payerAccount.body.balance).toBe(380);
    await expect.poll(async () => (await api<{ balance: number }>(request, payee.token, 'GET', `/accounts/${payee.accountId}`)).body.balance).toBe(120);
    await expect.poll(() => emailsTo(request, payee.email)).toContain('You received BRL 120.00');
    await expect.poll(() => emailsTo(request, payer.email)).toContain('Transfer of BRL 120.00 completed');
  });
});
