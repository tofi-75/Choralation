/** Compact lists exercise server lifecycle filtering, persistence and navigation. */
import { expect, test } from '@playwright/test';
const suffix = process.env.E2E_USER_SUFFIX;
const password = process.env.E2E_PASSWORD;
if (!suffix || !password) throw new Error('Run through scripts/e2e.ps1.');
test('Mass list: ready default, draft toggle, compact filters, pagination and arrow-only top', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 899, height: 764 });
  await page.goto('/login');
  await page.getByLabel('Username').fill(`e2e-${suffix}-planner`);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: `Welcome, e2e-${suffix}-planner.` }),
  ).toBeVisible();
  const headers = {
    'X-CSRFToken': (await (await page.request.get('/api/v1/auth/csrf/')).json())
      .csrf_token as string,
  };
  const prefix = `Mass list ${suffix}-${info.project.name}`;
  const pagingTag = `Paging-${suffix}-${info.project.name}`;
  // Only run-owned fixtures in a disposable database; no manual programs are touched.
  for (const [name, date, ready] of [
    ['ready upcoming', '2099-10-11', true],
    ['ready archived', '2000-10-11', true],
    ['draft upcoming', '2099-10-11', false],
    ['draft archived', '2000-10-11', false],
  ] as const) {
    const response = await page.request.post('/api/v1/masses/', {
      headers,
      data: { date, title: `${prefix} ${name}`, notes: pagingTag },
    });
    expect(response.status()).toBe(201);
    const mass = await response.json();
    if (ready)
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
  await expect(page.getByRole('button', { name: 'Ready Masses', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.mass-card')).toHaveCount(2);
  await expect(page.locator('.mass-card').first()).toContainText('ready upcoming');
  await expect(page.getByRole('region', { name: 'Archived', exact: true })).toContainText(
    'ready archived',
  );
  await expect(page.locator('.mass-card').filter({ hasText: 'draft' })).toHaveCount(0);
  const search = await page.getByLabel('Search Mass plans').boundingBox();
  const filters = await page.getByRole('button', { name: 'Filters', exact: true }).boundingBox();
  expect(Math.abs(search!.y - filters!.y)).toBeLessThan(2);
  expect(search!.height).toBe(44);
  expect(filters!.height).toBe(44);
  expect(filters!.x).toBeGreaterThan(search!.x);
  await expect(page.getByLabel('From date')).toBeHidden();
  await page.getByRole('button', { name: 'Pending drafts', exact: true }).click();
  await expect(page.locator('.mass-card')).toHaveCount(2);
  await expect(page.locator('.mass-card').first()).toContainText('draft upcoming');
  await expect(page.locator('.mass-card').filter({ hasText: 'ready' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByLabel('From date').fill('2099-01-01');
  await expect(page.locator('.mass-card')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Pending drafts', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('From date')).toHaveValue('2099-01-01');
  await expect(page.locator('.mass-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page).toHaveURL(/\/masses\?status=draft$/);
  await page.getByLabel('Search Mass plans').fill(prefix);
  await expect(page.locator('.mass-card')).toHaveCount(2);
  // The API allows 25/50/100, so exercise real second pages with 26 records per state.
  for (const ready of [false, true]) {
    for (let index = 0; index < 24; index++) {
      const response = await page.request.post('/api/v1/masses/', {
        headers,
        data: {
          date: '2100-10-11',
          title: `Paging fixture ${suffix}-${info.project.name}-${ready}-${index}`,
          notes: pagingTag,
        },
      });
      expect(response.status()).toBe(201);
      const mass = await response.json();
      if (ready)
        expect(
          (
            await page.request.post(`/api/v1/masses/${mass.id}/finalize/`, {
              headers: { ...headers, 'X-Expected-Mass-Revision': String(mass.revision) },
              data: {},
            })
          ).status(),
        ).toBe(200);
    }
  }
  await page.goto(`/masses?status=draft&q=${encodeURIComponent(pagingTag)}&page_size=25&page=2`);
  await expect(page.locator('.mass-card')).toHaveCount(1);
  await expect(page.locator('.mass-card')).toContainText('draft archived');
  await page.getByRole('button', { name: 'Ready Masses', exact: true }).click();
  await expect(page.locator('.mass-card')).toHaveCount(25);
  await expect(page.locator('.mass-card').first()).toContainText('ready upcoming');
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.mass-card')).toContainText('ready archived');
  await expect(page.getByText('End of matching Mass plans', { exact: true })).toBeVisible();
  await page.goto(`/masses?q=${encodeURIComponent(prefix)}`);
  await expect(page.locator('.mass-card')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('mass-list-controls.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 450 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const top = page.getByRole('button', { name: 'Scroll to top', exact: true });
  await expect(top).toHaveText('↑');
  await top.click();
  await expect(page.getByRole('link', { name: 'Create Mass', exact: true })).toBeInViewport();
  await expect(top).toHaveCount(0);
});
