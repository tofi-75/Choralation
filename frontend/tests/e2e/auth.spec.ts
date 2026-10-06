/** Session smoke uses PostgreSQL-backed accounts, Django CSRF, and the Vite proxy. */
import { expect, test } from '@playwright/test';

const suffix = process.env.E2E_USER_SUFFIX;
const password = process.env.E2E_PASSWORD;
if (!suffix || !password) throw new Error('Run browser tests through scripts/dev.ps1 e2e.');

for (const role of ['Admin', 'Planner', 'Viewer'] as const) {
  test(`${role}: login, refresh, expiry, mobile focus, and logout`, async ({ page }, testInfo) => {
    const username = `e2e-${suffix}-${role.toLowerCase()}`;
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill('deliberately-wrong');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('incorrect');
    await expect(page.getByLabel('Username')).toHaveValue(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: `Welcome, ${username}.` })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Your workspace access' }).getByText(role, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: `Welcome, ${username}.` })).toBeVisible();
    if (process.env.E2E_CAPTURE_PREVIEW === 'true' && role === 'Viewer') {
      await page.screenshot({
        path: `test-results/${testInfo.project.name}-workspace.png`,
        fullPage: true,
      });
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (testInfo.project.name.startsWith('mobile')) {
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Your workspace' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
    }
    // Invalidate the real session using the browser context, not a mocked /me.
    const token = await page.request.get('/api/v1/auth/csrf/');
    const { csrf_token: csrfToken } = await token.json();
    const invalidated = await page.request.post('/api/v1/auth/logout/', {
      data: {},
      headers: { 'X-CSRFToken': csrfToken },
    });
    expect(invalidated.status()).toBe(204);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  });
}
