import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
const suffix = process.env.E2E_USER_SUFFIX;
const password = process.env.E2E_PASSWORD;
if (!suffix || !password) throw new Error('Use the isolated browser launcher.');
test.skip(process.env.E2E_SIMPLE_ACCOUNTS !== 'true', 'Requires immediate registration access.');
async function login(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(`e2e-${suffix}-${role}`);
  await page.getByLabel('Password', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
}
async function choose(page: Page, label: string, name: string) {
  const group = page.getByRole('group', { name: label, exact: true });
  await group.getByRole('button', { name: /^Choose / }).click();
  await group.getByRole('checkbox', { name, exact: true }).check();
}
test('member PDF stays private, receives feedback and becomes shared only after planner approval', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const plannerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
  const outsider = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
  try {
    const planner = await plannerContext.newPage();
    await login(planner, 'planner');
    const csrf = (await (await outsider.request.get('/api/v1/auth/csrf/')).json()).csrf_token;
    const username = `e2e-${suffix}-outsider-${info.project.name}`;
    expect(
      (
        await outsider.request.post('/api/v1/auth/register/', {
          headers: { 'X-CSRFToken': csrf },
          data: {
            username,
            email: `${username}@example.test`,
            password,
            password_confirmation: password,
          },
        })
      ).status(),
    ).toBe(201);
    await login(page, 'viewer');
    await page.getByRole('link', { name: 'Add hymn', exact: true }).click();
    const title = `Private score ${suffix}-${info.project.name}`;
    await page.getByRole('textbox', { name: /^Title/ }).fill(title);
    await page.getByRole('combobox', { name: /^Language/ }).selectOption({ label: 'English' });
    await choose(page, 'Suitable placements', 'Communion');
    await choose(page, 'Suitable seasons', 'Ordinary Time');
    await page
      .getByRole('textbox', { name: 'Lyrics', exact: true })
      .fill('Fictional private lyrics');
    await page
      .getByLabel('Sheet music PDF', { exact: true })
      .setInputFiles('tests/fixtures/two-page-sheet-music.pdf');
    await expect(page.locator('.pdf-edit-preview canvas')).toBeVisible();
    await page.getByRole('button', { name: 'Save hymn', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Private hymn', exact: true })).toBeVisible();
    const id = Number(page.url().split('/').pop());
    await expect(page.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
    expect((await planner.request.get(`/api/v1/hymns/${id}/`)).status()).toBe(404);
    expect((await outsider.request.get(`/api/v1/hymns/${id}/sheet-music/`)).status()).toBe(404);
    expect(
      (await (await page.request.get(`/api/v1/hymns/?q=${encodeURIComponent(title)}`)).json())
        .count,
    ).toBe(0);
    await page.getByRole('button', { name: 'Request planner approval', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Awaiting planner approval', exact: true }),
    ).toBeVisible();
    await planner.goto('/choirs');
    const reviewCard = planner
      .getByRole('region', { name: /Hymn submissions/ })
      .locator('li')
      .filter({ hasText: title });
    await reviewCard.getByRole('link', { name: 'Review hymn' }).click();
    await expect(planner.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
    expect((await outsider.request.get(`/api/v1/hymns/${id}/`)).status()).toBe(404);
    await planner
      .getByRole('textbox', { name: 'Feedback (optional)' })
      .fill('Please check the key.');
    await planner.getByRole('button', { name: 'Request changes', exact: true }).click();
    await expect(
      planner.getByText('Changes requested. The hymn remains private.', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText('Planner feedback: Please check the key.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Edit hymn', exact: true }).click();
    await page.getByRole('textbox', { name: 'Default key', exact: true }).fill('D minor');
    await page.getByRole('button', { name: 'Save hymn', exact: true }).click();
    await page.getByRole('button', { name: 'Request planner approval', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Awaiting planner approval', exact: true }),
    ).toBeVisible();
    await planner.goto('/choirs');
    await reviewCard.getByRole('link', { name: 'Review hymn' }).click();
    await planner.getByRole('button', { name: 'Approve and publish', exact: true }).click();
    await expect(planner.getByText('Hymn approved and published.', { exact: true })).toBeVisible();
    await page.reload();
    expect(
      (await (await outsider.request.get(`/api/v1/hymns/${id}/`)).json()).submission,
    ).toBeNull();
    expect((await outsider.request.get(`/api/v1/hymns/${id}/sheet-music/`)).status()).toBe(200);
    expect(
      (await (await page.request.get(`/api/v1/hymns/?q=${encodeURIComponent(title)}`)).json())
        .count,
    ).toBe(1);
    await expect(page.getByRole('link', { name: 'Edit hymn', exact: true })).toHaveCount(0);
    await page.goto('/hymns/mine');
    await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('member-hymns.png'), fullPage: true });
  } finally {
    await plannerContext.close();
    await outsider.close();
  }
});
