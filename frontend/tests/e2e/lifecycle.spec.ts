/** M4 real-backend weekly workflow, cache refresh, stale review and retained edits. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const suffix = process.env.E2E_USER_SUFFIX;
const password = process.env.E2E_PASSWORD;
if (!suffix || !password) throw new Error('Run through dev.cmd e2e.');

async function signIn(page: Page, role = 'Planner') {
  await page.goto('/');
  await page.getByLabel('Username').fill(`e2e-${suffix}-${role.toLowerCase()}`);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: new RegExp(`Welcome, e2e-${suffix}`) }),
  ).toBeVisible();
}
async function csrf(page: Page) {
  return {
    'X-CSRFToken': (await (await page.request.get('/api/v1/auth/csrf/')).json())
      .csrf_token as string,
  };
}
async function confirm(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
  if (name === 'Finalize Mass') {
    await expect(page.getByText('Finalized Mass program', { exact: true })).toBeVisible();
  } else await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('Weekly workflow: create hymn, draft, finalize, usage/history, reopen and re-finalize', async ({
  page,
}, info) => {
  test.setTimeout(100_000);
  await signIn(page);
  const title = `M4 hymn ${suffix}-${info.project.name}`;
  const plan = `M4 program ${suffix}-${info.project.name}`;
  await page.goto('/hymns/new');
  await page.getByRole('textbox', { name: /^Title/ }).fill(title);
  await page.getByRole('combobox', { name: /^Language/ }).selectOption({ label: 'English' });
  const placements = page.getByRole('group', { name: 'Suitable placements', exact: true });
  await placements.getByRole('button', { name: /^Choose / }).click();
  await placements.getByRole('checkbox', { name: 'Communion', exact: true }).check();
  await page.getByLabel('Suitable regardless of season').check();
  await page.getByRole('button', { name: 'Save hymn', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const hymnId = Number(page.url().split('/').pop());
  await expect(page.getByText('Never used', { exact: true })).toBeVisible();
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('/masses');
  await page.getByRole('link', { name: 'Create Mass', exact: true }).click();
  await page
    .locator('#create-mass')
    .getByText('Title and notes (optional)', { exact: true })
    .click();
  await page.locator('#create-mass').getByLabel('Title', { exact: true }).fill(plan);
  await page.locator('#create-mass').getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/\/masses\/\d+\/edit$/);
  const massId = Number(page.url().split('/').at(-2));
  for (let index = 0; index < 2; index++) {
    await page.getByRole('button', { name: 'Add hymn to Communion', exact: true }).click();
    const picker = page.locator('.inline-hymn-picker');
    await picker.getByLabel('Search hymns').fill(title);
    await picker.getByRole('button', { name: `Choose ${title}`, exact: true }).click();
    if (index) await picker.getByRole('button', { name: 'Add anyway', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/masses/${massId}$`));
  // A failed transition leaves the saved program available and can be retried.
  await page.route(`**/masses/${massId}/finalize/`, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Temporary failure', code: 'server_error', errors: {} }),
    });
    await page.unroute(`**/masses/${massId}/finalize/`);
  });
  await page.getByRole('button', { name: 'Finalize Mass', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Temporary failure');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finalize Mass', exact: true }).click();
  await expect(page.getByText('Finalized Mass program', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reopen draft', exact: true })).toHaveCount(0);
  await page.goto(`/hymns/${hymnId}`);
  await expect(page.getByText('2 finalized selections', { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Hymn usage history' })
      .getByRole('link', { name: plan, exact: true }),
  ).toHaveCount(2);
  await page.goto(`/hymns?q=${encodeURIComponent(title)}&ordering=most_used`);
  await expect(
    page.getByText('2 finalized selections', { exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
  await page.goto(`/history?q=${encodeURIComponent(plan)}`);
  await expect(page.getByRole('link', { name: plan, exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('mass-history.png'), fullPage: true });
  await page.request.post('/api/v1/auth/logout/', { headers: await csrf(page), data: {} });
  await signIn(page, 'Admin');
  // Prime the never-used filtered cache, then reopen and revisit without reload.
  await page.goto(`/hymns?q=${encodeURIComponent(title)}&never_used=true`);
  await expect(
    page.getByRole('heading', { name: 'No hymns match these filters.', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0);
  const plans = page
    .getByRole('link', { name: 'Mass plans', exact: true })
    .filter({ visible: true });
  if (!(await plans.count())) await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page
    .getByRole('link', { name: 'Mass plans', exact: true })
    .filter({ visible: true })
    .click();
  await page.getByLabel('Search Mass plans').fill(plan);
  await page.locator('.mass-card').filter({ hasText: plan }).click();
  await confirm(page, 'Reopen draft');
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/never_used=true/);
  await expect(
    page.getByRole('link', { name: title, exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
  await page.goto(`/hymns/${hymnId}`);
  await expect(page.getByText('Never used', { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Hymn usage history' })
      .getByRole('link', { name: plan, exact: true }),
  ).toHaveCount(0);
  await page.goto(`/masses/${massId}`);
  await confirm(page, 'Finalize Mass');
  const usage = await (await page.request.get(`/api/v1/hymns/${hymnId}/`)).json();
  expect(usage.usage_count).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('finalized-program.png'), fullPage: true });
});

test('Stale finalization notice and background finalization preserve editor working copy', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await signIn(page);
  const response = await page.request.post('/api/v1/masses/', {
    headers: await csrf(page),
    data: { date: '2026-10-11', title: `M4 stale ${suffix}` },
  });
  const mass = await response.json();
  await page.goto(`/masses/${mass.id}`);
  await expect(page.getByRole('button', { name: 'Finalize Mass', exact: true })).toBeEnabled();
  await page.request.patch(`/api/v1/masses/${mass.id}/`, {
    headers: { ...(await csrf(page)), 'X-Expected-Mass-Revision': String(mass.revision) },
    data: { notes: 'Another planner saved' },
  });
  await page.getByRole('button', { name: 'Finalize Mass', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('This Mass changed.');
  await expect(page.getByRole('button', { name: 'Finalize Mass', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Another planner saved', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: "I've reviewed the refreshed program", exact: true })
    .click();
  const editor = await context.newPage();
  await editor.goto(`/masses/${mass.id}/edit`);
  await editor.getByRole('button', { name: '← Back to Mass details' }).click();
  await editor.getByText('Title and Mass notes', { exact: true }).click();
  // Keep an unconfirmed local edit. The remote finalize must not redirect it away.
  await editor.route(`**/masses/${mass.id}/`, async (route) => {
    if (route.request().method() === 'PATCH')
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Offline test', code: 'server_error', errors: {} }),
      });
    else await route.continue();
  });
  await editor.getByRole('textbox', { name: /^Mass notes/ }).fill('Keep my local notes');
  await expect(editor.getByText('Unable to save', { exact: true })).toBeVisible();
  await page.bringToFront();
  await confirm(page, 'Finalize Mass');
  await editor.bringToFront();
  await editor.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expect(
    editor.getByText('This Mass was finalized in another session.', { exact: false }),
  ).toBeVisible();
  await expect(editor.getByRole('textbox', { name: /^Mass notes/ })).toHaveValue(
    'Keep my local notes',
  );
  await expect(editor).toHaveURL(new RegExp(`/masses/${mass.id}/edit$`));
  await editor.close();
});
