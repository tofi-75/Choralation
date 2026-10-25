import { expect, test } from '@playwright/test';

test('Password controls preview one character, mask on blur, and toggle without submitting', async ({
  page,
}, info) => {
  await page.goto('/login');
  const password = page.getByLabel('Password', { exact: true });
  await password.pressSequentially('ab');
  const mask = page.locator('.password-mask');
  await expect(mask).toHaveText('•b');
  await expect(mask).toHaveAttribute('aria-hidden', 'true');
  await expect(mask).toHaveCount(0);
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveValue('ab');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('ab');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'password');
  // Playwright resets an unfocused input's selection before typing; explicitly append.
  await password.press('End');
  await password.pressSequentially('c');
  await expect(password).toHaveValue('abc');
  await expect(mask).toHaveText('••c');
  await page.getByLabel('Email or username').focus();
  await expect(mask).toHaveCount(0);
  await password.fill('filled-password');
  await expect(mask).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('password-controls.png') });
});

test('Registration and reset have independent visibility controls and preserve their values', async ({
  page,
}) => {
  await page.goto('/register');
  const password = page.getByLabel('Password', { exact: true });
  const confirmation = page.getByLabel('Confirm password', { exact: true });
  await password.fill('fictional-password');
  await confirmation.fill('fictional-password');
  await page
    .locator('.password-control')
    .first()
    .getByRole('button', { name: 'Show password' })
    .click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(confirmation).toHaveAttribute('type', 'password');
  await expect(confirmation).toHaveValue('fictional-password');
  await page.goto('/reset-password#token=fictional-ui-token');
  const replacement = page.getByLabel('New password', { exact: true });
  await replacement.fill('replacement-password');
  await page
    .locator('.password-control')
    .first()
    .getByRole('button', { name: 'Show password' })
    .click();
  await expect(replacement).toHaveAttribute('type', 'text');
  await expect(replacement).toHaveValue('replacement-password');
  await expect(page.getByLabel('Confirm new password', { exact: true })).toHaveAttribute(
    'type',
    'password',
  );
});
