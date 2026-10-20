/** Saved, archived and draft lists filter on the server before pagination. */
import { expect, test } from '@playwright/test';
const suffix = process.env.E2E_USER_SUFFIX;
const password = process.env.E2E_PASSWORD;
if (!suffix || !password) throw new Error('Run through scripts/e2e.ps1.');
test('Mass lists: chronological saved programs, separate archive and drafts, filters and paging', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.goto('/login');
  await page.getByLabel('Username').fill(`e2e-${suffix}-planner`);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
  const headers = {
    'X-CSRFToken': (await (await page.request.get('/api/v1/auth/csrf/')).json())
      .csrf_token as string,
  };
  const prefix = `Mass list ${suffix}-${info.project.name}`;
  for (let index = 0; index < 29; index++) {
    const response = await page.request.post('/api/v1/masses/', {
      headers,
      data: {
        date: index === 28 ? '2000-01-01' : `2099-10-${String((index % 26) + 1).padStart(2, '0')}`,
        title: `${prefix} ${index}`,
      },
    });
    expect(response.status()).toBe(201);
    const mass = await response.json();
    if (index < 27 || index === 28)
      expect(
        (
          await page.request.post(`/api/v1/masses/${mass.id}/finalize/`, {
            headers: { ...headers, 'X-Expected-Mass-Revision': String(mass.revision) },
            data: {},
          })
        ).status(),
      ).toBe(200);
  }
  await page.goto(`/masses?q=${encodeURIComponent(prefix)}`);
  await expect(page.locator('.mass-card')).toHaveCount(25);
  await expect(page.getByRole('region', { name: 'Archived', exact: true })).toHaveCount(0);
  const dates = await page.locator('.mass-card .eyebrow').allTextContents();
  expect(dates).toEqual([...dates].sort());
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(page.getByLabel('From date')).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.mass-card')).toHaveCount(2);
  await expect(page.getByText('End of matching Mass plans', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.mass-card')).toHaveCount(2);
  await page.getByRole('link', { name: 'Archived Masses', exact: true }).click();
  await page.getByLabel('Search Mass plans').fill(prefix);
  await expect(page.locator('.mass-card')).toHaveCount(1);
  await page.locator('.archived-program summary').click();
  await expect(page.locator('.archive-hymns')).toContainText('Hymn not selected');
  await page.getByRole('link', { name: 'Drafts', exact: true }).click();
  await page.getByLabel('Search Mass plans').fill(prefix);
  await expect(page.locator('.mass-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Draft Masses', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Saved Masses', exact: true }).click();
  await page.getByLabel('Search Mass plans').fill(prefix);
  await expect(page.locator('.mass-card')).toHaveCount(25);
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 450 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const top = page.getByRole('button', { name: 'Scroll to top', exact: true });
  await expect(top).toHaveText('↑');
  await top.click();
  await expect(page.getByRole('link', { name: 'New Mass', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('saved-masses.png'), fullPage: true });
});
