import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('simple accounts register, email-login and change password without account mail', async ({
  page,
}, info) => {
  test.skip(process.env.E2E_SIMPLE_ACCOUNTS !== 'true', 'Run with simple account capabilities.');
  const suffix = process.env.E2E_USER_SUFFIX;
  const password = process.env.E2E_PASSWORD;
  if (!suffix || !password) throw new Error('Use the isolated browser launcher.');
  const username = `e2e-${suffix}-simple-${info.project.name}`;
  const email = `${username}@example.test`;
  const folder = resolve(process.env.EMAIL_FILE_PATH ?? '../.cache/e2e-emails');
  const before = existsSync(folder) ? readdirSync(folder).length : 0;
  await page.goto('/register');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
  await expect((await page.request.get('/api/v1/auth/me/')).json()).resolves.toMatchObject({
    username,
    role: 'Viewer',
    email_verified: false,
    verification_required: false,
    can_create_choirs: false,
  });
  expect((await page.request.get('/api/v1/hymns/')).status()).toBe(200);
  for (const path of [
    '/verify-email#token=old-fictional-link',
    '/reset-password#token=old-fictional-link',
    '/forgot-password',
  ]) {
    await page.goto(path);
    await expect(
      page.getByText('For help accessing your account, contact', { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update password' })).toHaveCount(0);
    await expect((await page.request.get('/api/v1/auth/me/')).json()).resolves.toMatchObject({
      username,
    });
  }
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Forgot password?' })).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Need help signing in? Contact support' }),
  ).toBeVisible();
  await page.getByLabel('Email or username').fill(email.toUpperCase());
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
  await page.goto('/account');
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page.getByLabel('New password', { exact: true }).fill(password + 'New');
  await page.getByLabel('Confirm new password', { exact: true }).fill(password + 'New');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toContainText('Password updated');
  expect(existsSync(folder) ? readdirSync(folder).length : 0).toBe(before);
  await page.screenshot({ path: info.outputPath('simple-login.png'), fullPage: true });
});
