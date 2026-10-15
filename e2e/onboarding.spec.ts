import { expect, test } from '@playwright/test';
import { emailsTo, evidence, operatorPage, uniqueEmail, validCpf, verificationLink } from './support';

test('a visitor opens an account, from sign-up to an approved checking account', async ({ page, browser, request, baseURL }, testInfo) => {
  const email = uniqueEmail('helena');
  const cpf = validCpf();

  await test.step('sign up with Keycloak through the authorization code flow with PKCE', async () => {
    await page.goto('/');
    await evidence(page, testInfo, '01 public landing page');
    await page.getByRole('button', { name: 'Open your account' }).click();

    await page.waitForURL(/\/realms\/eventbank\/protocol\/openid-connect\/auth/);
    const authorize = new URL(page.url());
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('code_challenge')).toBeTruthy();
    expect(authorize.searchParams.get('prompt')).toBe('create');

    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="firstName"]').fill('Helena');
    await page.locator('input[name="lastName"]').fill('Prado');
    await evidence(page, testInfo, '02 Keycloak registration, PKCE S256 in the URL');
    await page.locator('button[type="submit"], input[type="submit"]').first().click();
    await expect(page.getByText(/verify your email/i).first()).toBeVisible();
    await evidence(page, testInfo, '03 Keycloak asks to verify the e-mail');
  });

  await test.step('verify the e-mail from Mailpit and choose a password', async () => {
    await page.goto(await verificationLink(request, email));
    await page.locator('input[name="password-new"]').fill('helena-pass-123');
    await page.locator('input[name="password-confirm"]').fill('helena-pass-123');
    await evidence(page, testInfo, '04 password is chosen after the e-mail is verified');
    await page.locator('button[type="submit"], input[type="submit"]').first().click();
    await page.waitForURL('**/onboarding');
    await expect(page.getByRole('heading', { name: 'Open your account' })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
  });

  await test.step('send the application', async () => {
    await page.getByLabel('Full name, as on your documents').fill('Helena Prado');
    await page.getByLabel('CPF').pressSequentially(cpf);
    await page.getByLabel('Birth date').fill('1992-03-08');
    await page.getByLabel('Mobile phone').pressSequentially('11987650000');
    await evidence(page, testInfo, '05 application form with masked CPF and phone');
    await page.getByRole('button', { name: 'Send application' }).click();
    await expect(page.getByText('Under review')).toBeVisible();
    await evidence(page, testInfo, '06 application under review');
  });

  await test.step('an operator approves it in the back office', async () => {
    const operator = await operatorPage(browser, baseURL!);
    await operator.waitForURL('**/backoffice');
    const application = operator.getByRole('listitem').filter({ hasText: email });
    await expect(application).toContainText(`${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`);
    await evidence(operator, testInfo, '07 operator sees the pending application');
    await application.getByRole('button', { name: 'Approve' }).click();
    await expect(application).toBeHidden();
    await operator.context().close();
  });

  await test.step('the customer sees the account opened on its own', async () => {
    await expect(page.getByText('Account open')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Branch and account 0001\/\d{6}-\d/)).toBeVisible();
    await evidence(page, testInfo, '08 approved, account opened by the Accounts service');
    await page.getByRole('link', { name: 'Go to your account' }).click();
    await expect(page.getByRole('heading', { name: 'Your accounts' })).toBeVisible();
    await expect(page.getByRole('link', { name: /BRL account/ })).toContainText('BRL 0.00');
    await expect(page.getByRole('navigation', { name: 'Main' })).toContainText('PIX');
    await evidence(page, testInfo, '09 the checking account, with PIX and Cards unlocked');
  });

  await test.step('every step reached the customer by e-mail', async () => {
    await expect
      .poll(() => emailsTo(request, email))
      .toEqual(expect.arrayContaining(['We received your application', 'Your application was approved', 'Your BRL account is open']));
  });
});
