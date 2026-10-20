/** Owner home/saved-program review with real sessions, persistence, and role gates. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
const suffix = process.env.E2E_USER_SUFFIX;
const password = process.env.E2E_PASSWORD;
if (!suffix || !password) throw new Error('Run through scripts/e2e.ps1.');
async function login(page: Page, role = 'Planner') {
  await page.goto('/login');
  await page.getByLabel('Username').fill(`e2e-${suffix}-${role.toLowerCase()}`);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
}
async function csrf(page: Page) {
  return {
    'X-CSRFToken': (await (await page.request.get('/api/v1/auth/csrf/')).json())
      .csrf_token as string,
  };
}
test('Home and saved Mass actions: Ordinary Time, compact creation, phone confirmation, planner edit and admin delete', async ({
  page,
}, info) => {
  test.setTimeout(100_000);
  await login(page);
  const prefix = `Home review ${suffix}-${info.project.name}`;
  const headers = await csrf(page);
  const languages = await (await page.request.get('/api/v1/languages/')).json();
  const seasons = await (await page.request.get('/api/v1/liturgical-seasons/')).json();
  const placements = await (await page.request.get('/api/v1/mass-placements/')).json();
  const ordinary = seasons.find((row: { slug: string }) => row.slug === 'ordinary-time');
  const cross = seasons.find((row: { slug: string }) => row.slug === 'holy-cross');
  const placement = placements.find((row: { slug: string }) => row.slug === 'communion');
  const response = await page.request.post('/api/v1/hymns/', {
    headers,
    data: {
      title: prefix,
      language_id: languages[0].id,
      placement_ids: [placement.id],
      season_ids: [ordinary.id],
      is_season_neutral: false,
    },
  });
  expect(response.status()).toBe(201);
  const hymn = await response.json();
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: prefix, exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Practice' })).toContainText('Coming soon');
  await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
  const upcoming = await (
    await page.request.get('/api/v1/masses/?status=finalized&archived=false')
  ).json();
  if (upcoming.count)
    await expect(page.locator('.next-mass')).toHaveAttribute(
      'href',
      `/masses/${upcoming.results[0].id}`,
    );
  await page.getByRole('link', { name: 'All Masses', exact: true }).click();
  await page.getByRole('link', { name: 'New Mass', exact: true }).click();
  const date = page.getByLabel('Date', { exact: true });
  const dateBox = (await date.boundingBox())!;
  const fieldBox = (await page.locator('.mass-date-field').boundingBox())!;
  expect(dateBox.width).toBeLessThanOrEqual(fieldBox.width);
  expect(dateBox.width).toBeLessThanOrEqual(208);
  await expect(page.locator('.date-calendar-icon svg')).toBeVisible();
  await date.fill('2099-10-11');
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  await page
    .getByRole('combobox', { name: 'Liturgical season', exact: true })
    .selectOption(String(cross.id));
  await page.getByText('Title and notes (optional)', { exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill(prefix);
  page.on('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/\/masses\/\d+\/edit$/);
  const id = Number(page.url().split('/').at(-2));
  const shuffle = page.getByRole('button', { name: 'Random hymns', exact: true });
  await expect(shuffle.locator('svg')).toHaveCount(1);
  expect(
    await page
      .locator('.planner-sections')
      .evaluate((node) => node.lastElementChild?.classList.contains('random-picker')),
  ).toBe(true);
  await page.getByRole('button', { name: 'Add hymn to Communion', exact: true }).click();
  await page.getByLabel('Search hymns', { exact: true }).fill(prefix);
  await page.getByRole('button', { name: `Choose ${prefix}`, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Selection warnings' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/masses/${id}$`));
  const finalize = page.getByRole('button', { name: 'Finalize Mass', exact: true });
  const touch = await page.evaluate(() => matchMedia('(max-width: 760px), (hover: none)').matches);
  if (!touch) {
    await finalize.hover();
    await expect(page.getByRole('tooltip')).toContainText('usage counts');
  }
  await finalize.click();
  if (touch) {
    await expect(page.getByRole('dialog')).toContainText('read-only');
    await expect(page.getByText('Saved draft', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm finalization', exact: true }).click();
  }
  await expect(page.getByText('Finalized Mass program', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reopen draft' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete Mass', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit Mass', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('usage counts');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Finalized Mass program', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Mass', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm edit', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/masses/${id}/edit$`));
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  expect((await (await page.request.get(`/api/v1/hymns/${hymn.id}/`)).json()).usage_count).toBe(0);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await finalize.click();
  if (touch) await page.getByRole('button', { name: 'Confirm finalization', exact: true }).click();
  await expect(page.getByText('Finalized Mass program', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('saved-mass-actions.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Archive the run-owned program and verify all hymn links can be expanded.
  await page.getByRole('button', { name: 'Edit Mass', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm edit', exact: true }).click();
  await expect(page).toHaveURL(/\/edit$/);
  const draft = await (await page.request.get(`/api/v1/masses/${id}/`)).json();
  const dated = await (
    await page.request.patch(`/api/v1/masses/${id}/`, {
      headers: { ...(await csrf(page)), 'X-Expected-Mass-Revision': String(draft.revision) },
      data: { date: '2000-01-01' },
    })
  ).json();
  expect(
    (
      await page.request.post(`/api/v1/masses/${id}/finalize/`, {
        headers: { ...(await csrf(page)), 'X-Expected-Mass-Revision': String(dated.revision) },
        data: {},
      })
    ).status(),
  ).toBe(200);
  await page.goto(`/masses?archived=true&q=${encodeURIComponent(prefix)}`);
  await expect(page.locator('.mass-card')).toHaveCount(1);
  await page.locator('.archived-program summary').click();
  await expect(
    page.locator('.archive-hymns').getByRole('link', { name: prefix, exact: true }),
  ).toBeVisible();
  await page.request.post('/api/v1/auth/logout/', { headers: await csrf(page), data: {} });
  await login(page, 'Admin');
  await page.goto(`/masses/${id}`);
  await page.getByRole('button', { name: 'Delete Mass', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('permanently deletes');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await page.request.get(`/api/v1/masses/${id}/`)).status()).toBe(200);
  await page.getByRole('button', { name: 'Delete Mass', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page).toHaveURL(/\/masses$/);
  expect((await page.request.get(`/api/v1/masses/${id}/`)).status()).toBe(404);
  const retained = await (await page.request.get(`/api/v1/hymns/${hymn.id}/`)).json();
  expect(retained.id).toBe(hymn.id);
  expect(retained.usage_count).toBe(0);
});
