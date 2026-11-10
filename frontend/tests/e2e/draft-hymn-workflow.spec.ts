import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { initialChoirId, selectInitialChoir } from './choir-context';

const suffix = process.env.E2E_USER_SUFFIX;
const password = process.env.E2E_PASSWORD;
if (!suffix || !password) throw new Error('Run through the browser fixture.');

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(`e2e-${suffix}-admin`);
  await page.getByLabel('Password', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
}

async function expectCentered(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(3);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(3);
  expect(box.height).toBeLessThan(viewport.height - 32);
}

test('A draft resumes in edit mode and can create or review a hymn in the same section', async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await signIn(page);
  await selectInitialChoir(page);
  const token = (await (await page.request.get('/api/v1/auth/csrf/')).json()).csrf_token;
  const headers = { 'X-Choir-ID': await initialChoirId(page), 'X-CSRFToken': token };
  const title = `Draft hymns ${suffix}-${info.project.name}`;
  const response = await page.request.post('/api/v1/masses/', {
    headers,
    data: { date: '2098-10-11', title },
  });
  expect(response.status()).toBe(201);
  const mass = await response.json();
  const path = `/masses/${mass.id}`;
  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(path + '/edit$'));
  const communion = page.getByRole('region', { name: 'Communion', exact: true });

  const add = communion.getByRole('button', { name: 'Add hymn to Communion' });
  await add.click();
  const search = communion.getByRole('searchbox', { name: 'Search hymns' });
  const missing = communion.getByRole('button', { name: 'Hymn not found, add hymn?' });
  const hymn = `${title} new communion`;
  await search.fill(hymn);
  await missing.click();
  await expect(page).toHaveURL(/\/hymns\/new$/);
  await expect(page.getByRole('textbox', { name: /^Title/ })).toHaveValue(hymn);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(search).toHaveValue(hymn);
  await missing.click();

  async function saveHymn(placement: string) {
    await page.getByRole('combobox', { name: /^Language/ }).selectOption({ label: 'English' });
    const placements = page.getByRole('group', { name: 'Suitable placements', exact: true });
    await placements.getByRole('button', { name: /^Choose / }).click();
    await placements.getByRole('checkbox', { name: placement, exact: true }).check();
    const seasons = page.getByRole('group', { name: 'Suitable seasons', exact: true });
    await seasons.getByRole('button', { name: /^Choose / }).click();
    await seasons.getByRole('checkbox', { name: 'Ordinary Time', exact: true }).check();
    await page.getByRole('button', { name: 'Save hymn', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(path + '/edit$'));
  }

  await saveHymn('Communion');
  await expect(communion.getByRole('link', { name: hymn, exact: true })).toHaveCount(1);
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();
  await page.reload();
  await expect(communion.getByRole('link', { name: hymn, exact: true })).toHaveCount(1);

  const mismatched = `${title} new offertory`;
  await add.click();
  await search.fill(mismatched);
  await missing.click();
  await saveHymn('Offertory');
  const warnings = page.getByRole('dialog', { name: 'Selection warnings' });
  await expectCentered(page, warnings);
  await expect(warnings).toContainText('Not classified for Communion.');
  await warnings.getByRole('button', { name: 'Cancel choice' }).click();
  await expect(communion.getByRole('link', { name: mismatched, exact: true })).toHaveCount(0);
  await expect(missing).toHaveCount(0);
  await communion.getByRole('button', { name: 'Show matches from all placements' }).click();
  await communion.getByRole('button', { name: `Choose ${mismatched}` }).click();
  await warnings.getByRole('button', { name: 'Add anyway' }).click();
  await expect(communion.getByRole('link', { name: mismatched, exact: true })).toHaveCount(1);

  await page.getByRole('button', { name: 'Delete draft' }).click();
  const deletion = page.getByRole('dialog', { name: 'Delete this draft?' });
  await expectCentered(page, deletion);
  await deletion.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('link', { name: '← Mass plans' }).click();
  await page.getByRole('link', { name: 'Drafts', exact: true }).click();
  await page.getByRole('link', { name: title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(path + '/edit$'));
  await page.getByRole('button', { name: 'Save Mass', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(path + '$'));
  await expect(page.getByText('Finalized Mass program', { exact: true })).toBeVisible();
  const saved = await (await page.request.get(`/api/v1/masses/${mass.id}/`, { headers })).json();
  expect(saved.status).toBe('finalized');
  expect(saved.program).toHaveLength(2);
});

test('Settings combines Account and the saved default choir', async ({ page }, info) => {
  await signIn(page);
  const token = (await (await page.request.get('/api/v1/auth/csrf/')).json()).csrf_token;
  const choirName = `Preferred choir ${suffix}-${info.project.name}`;
  const response = await page.request.post('/api/v1/choirs/', {
    headers: { 'X-CSRFToken': token },
    data: { name: choirName },
  });
  expect(response.status()).toBe(201);
  const choir = await response.json();
  await page.goto('/account');
  await expect(page).toHaveURL(/\/settings\?tab=account$/);
  await expect(page.getByRole('heading', { name: 'Account settings' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Settings tabs' })
    .getByRole('link', { name: 'Choir', exact: true })
    .click();
  await page.getByRole('combobox', { name: 'Default choir' }).selectOption(String(choir.id));
  await page.getByRole('button', { name: 'Save default choir' }).click();
  const feedback = page.getByRole('dialog', { name: 'Notification' });
  await expectCentered(page, feedback);
  await expect(feedback).toContainText('Default choir saved.');
  await feedback.getByRole('button', { name: 'Dismiss' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn(page);
  await expect(page.getByRole('combobox', { name: 'Active choir' })).toHaveValue(String(choir.id));
  const freshToken = (await (await page.request.get('/api/v1/auth/csrf/')).json()).csrf_token;
  const cleared = await page.request.patch('/api/v1/auth/me/', {
    headers: { 'X-CSRFToken': freshToken },
    data: { default_choir_id: null },
  });
  expect(cleared.status()).toBe(200);
});
