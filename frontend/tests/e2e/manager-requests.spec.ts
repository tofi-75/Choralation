import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { initialChoirId } from './choir-context';

function verificationToken(email: string) {
  const folder = resolve(process.env.EMAIL_FILE_PATH ?? '../.cache/e2e-emails');
  const token = readdirSync(folder)
    .map((file) => readFileSync(resolve(folder, file), 'utf8'))
    .find(
      (message) =>
        message.includes(`To: ${email}`) && message.includes('Verify your Choralation email'),
    )
    ?.match(/#token=([^\s]+)/)?.[1];
  if (!token) throw new Error('The test verification email was not captured.');
  return token;
}

async function openChoirs(page: Page) {
  const link = page.getByRole('link', { name: 'Choirs', exact: true }).filter({ visible: true });
  if (!(await link.count())) await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await link.click();
}

test('Admin reviews Manager requests and an approved user can plan their own choir', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90_000);
  const suffix = process.env.E2E_USER_SUFFIX;
  const password = process.env.E2E_PASSWORD;
  if (!suffix || !password) throw new Error('Use the isolated browser launcher.');
  const username = `e2e-${suffix}-manager-${info.project.name}`;
  const email = `${username}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  if (process.env.E2E_SIMPLE_ACCOUNTS !== 'true') {
    await expect(
      page.getByRole('heading', { name: 'Verify your email', exact: true }),
    ).toBeVisible();
    await page.goto(`/verify-email#token=${verificationToken(email)}`);
  }
  await expect(page.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
  await expect(page.locator('.role-badge')).toHaveText('Viewer');
  await openChoirs(page);
  await expect(page.getByRole('link', { name: 'Create choir', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Request Manager access', exact: true }).click();
  await expect(page.getByRole('link', { name: /^Manager requests/ })).toHaveCount(0);
  const access = page.getByRole('region', { name: 'Manager access' });
  const requestAccess = access.getByRole('button', { name: 'Request Manager access', exact: true });
  await requestAccess.click();
  await expect(access).toContainText('Your request is pending Admin review.');
  await expect(requestAccess).toHaveCount(0);

  const adminContext = await browser.newContext({
    viewport: info.project.use.viewport,
    isMobile: info.project.use.isMobile,
    hasTouch: info.project.use.hasTouch,
    baseURL: 'http://127.0.0.1:5174',
  });
  try {
    const admin = await adminContext.newPage();
    await admin.goto('/login');
    await admin.getByLabel('Email or username').fill(`e2e-${suffix}-admin`);
    await admin.getByLabel('Password', { exact: true }).fill(password);
    await admin.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(admin.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
    const otherChoirId = await initialChoirId(admin);
    await admin.goto('/settings');
    const tab = admin.getByRole('link', { name: /^Manager requests/ });
    await expect(tab).toHaveText('Manager requests (1)');
    await tab.click();

    async function review(action: 'Decline' | 'Approve') {
      await admin
        .getByRole('button', { name: `${action} Manager request from ${username}`, exact: true })
        .click();
      const dialog = admin.getByRole('dialog', { name: 'Confirm action' });
      await expect(dialog).toContainText(username);
      await dialog.getByRole('button', { name: action, exact: true }).click();
      await expect(admin.getByText('No pending requests.', { exact: true })).toBeVisible();
      await admin.getByRole('button', { name: 'Dismiss', exact: true }).click();
    }

    await review('Decline');
    await access.getByRole('button', { name: 'Refresh status' }).click();
    await expect(access).toContainText('Your previous request was declined.');
    await requestAccess.click();
    await expect(access).toContainText('Your request is pending Admin review.');
    await admin.getByRole('button', { name: 'Refresh requests', exact: true }).click();
    await review('Approve');

    // This is the original signed-in page. Opening Choirs picks up approval.
    await openChoirs(page);
    await expect(page.locator('.role-badge')).toHaveText('Manager');
    expect((await page.request.get(`/api/v1/choirs/${otherChoirId}/`)).status()).toBe(404);
    const choirName = `Manager choir ${info.project.name}`;
    await page.getByRole('link', { name: 'Create choir', exact: true }).click();
    await page.getByRole('textbox', { name: /Choir name/ }).fill(choirName);
    await page.getByRole('button', { name: 'Create choir', exact: true }).click();
    await expect(page.getByRole('heading', { name: choirName, exact: true })).toBeVisible();
    const choirId = Number(page.url().split('/').at(-1));
    const choirs = await (await page.request.get('/api/v1/choirs/')).json();
    expect(choirs).toMatchObject([{ id: choirId, role: 'Planner' }]);
    await page.getByLabel('Active choir').selectOption(String(choirId));
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/masses');
    await page.getByRole('link', { name: 'New Mass', exact: true }).click();
    await page.getByLabel('Date', { exact: true }).fill('2096-10-14');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save Mass', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save Mass', exact: true }).click();
    await expect(page.getByText('Finalized Mass program', { exact: true })).toBeVisible();
  } finally {
    await adminContext.close();
  }
});
