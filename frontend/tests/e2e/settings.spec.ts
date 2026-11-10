import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
const suffix = process.env.E2E_USER_SUFFIX;
const password = process.env.E2E_PASSWORD;
if (!suffix || !password) throw new Error('Use the isolated browser launcher.');
async function login(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(`e2e-${suffix}-${role}`);
  await page.getByLabel('Password', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
}
async function csrf(page: Page) {
  return (await (await page.request.get('/api/v1/auth/csrf/')).json()).csrf_token as string;
}
test('Admin classification lifecycle, reference safety, keyboard order and stale edits', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await login(page, 'admin');
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  for (const label of ['Genres', 'Seasons', 'Mass sections', 'Languages', 'Tags']) {
    await page
      .getByRole('navigation', { name: 'Classification settings' })
      .getByRole('button', { name: label, exact: true })
      .click();
    const name = `QA ${label} ${suffix} ${info.project.name}`;
    await page.getByRole('button', { name: 'Add category', exact: true }).click();
    await page.getByRole('textbox', { name: /^Name/ }).fill(name);
    await page
      .getByRole('textbox', { name: 'Description', exact: true })
      .fill('Fictional M6 acceptance');
    await page.getByRole('button', { name: 'Save category', exact: true }).click();
    const row = page.locator('.settings-row').filter({ hasText: name });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
    await page.getByRole('textbox', { name: /^Name/ }).fill(name + ' renamed');
    await page.getByRole('button', { name: 'Save category', exact: true }).click();
    await expect(row.locator('strong').filter({ hasText: name + ' renamed' })).toBeVisible();
    const move = row.getByRole('button', { name: /^Move .* down$/ });
    if (await move.isEnabled()) {
      await move.focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Save order', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Save order', exact: true })).toHaveCount(0);
    }
    await row.getByRole('button', { name: /^Deactivate/ }).click();
    await page.getByRole('button', { name: 'Confirm deactivation', exact: true }).click();
    await expect(row.getByText('Inactive', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: /^Activate/ }).click();
    await page.getByRole('button', { name: 'Confirm activation', exact: true }).click();
    await expect(row.getByText('Active', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: /^Delete / }).click();
    await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
    await expect(row).toHaveCount(0);
  }
  await page
    .getByRole('navigation', { name: 'Classification settings' })
    .getByRole('button', { name: 'Languages', exact: true })
    .click();
  const english = page
    .locator('.settings-row')
    .filter({ has: page.getByText('English', { exact: true }) });
  const categories = await (await page.request.get('/api/v1/languages/?is_active=all')).json();
  const language = categories.find((r: { name: string }) => r.name === 'English');
  const placements = await (await page.request.get('/api/v1/mass-placements/')).json();
  expect(
    (
      await page.request.post('/api/v1/hymns/', {
        headers: { 'X-CSRFToken': await csrf(page) },
        data: {
          title: `M6 dependency ${suffix} ${info.project.name}`,
          language_id: language.id,
          placement_ids: [placements[0].id],
          is_season_neutral: true,
        },
      })
    ).status(),
  ).toBe(201);
  await english.getByRole('button', { name: 'Delete English', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm delete', exact: true })).toBeDisabled();
  await expect(page.getByText(/This category has .* links/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await english.getByRole('button', { name: 'Edit English', exact: true }).click();
  expect(
    (
      await page.request.patch(`/api/v1/languages/${language.id}/`, {
        headers: { 'X-CSRFToken': await csrf(page) },
        data: { description: 'Concurrent change' },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('Keep this deliberate edit');
  await page.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Refresh');
  await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue(
    'Keep this deliberate edit',
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit English', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('classification-settings.png'), fullPage: true });
});
test('choir calendar preview, overrides, version conflicts and read-only member access', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  await login(page, 'planner');
  const created = await page.request.post('/api/v1/choirs/', {
    headers: { 'X-CSRFToken': await csrf(page) },
    data: { name: `e2e-${suffix}-calendar-${info.project.name}`, is_public: false },
  });
  expect(created.status()).toBe(201);
  const choir = await created.json();
  const url = `/choirs/${choir.id}/calendar`;
  const api = `/api/v1/choirs/${choir.id}/calendar/`;
  await page.goto(url);
  await page.getByRole('combobox', { name: 'Calendar', exact: true }).selectOption('manual');
  await page
    .getByRole('combobox', { name: 'Timezone', exact: true })
    .selectOption('Pacific/Honolulu');
  await page.getByRole('button', { name: 'Save calendar settings', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Save calendar settings', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Override date', { exact: true }).fill('2027-03-28');
  await page
    .getByRole('combobox', { name: 'Override season', exact: true })
    .selectOption({ label: 'Resurrection' });
  await page.getByRole('button', { name: 'Save date override', exact: true }).click();
  await expect(page.locator('.settings-row').filter({ hasText: '2027-03-28' })).toBeVisible();
  await page.getByLabel('Preview date', { exact: true }).fill('2027-03-28');
  await page.getByRole('button', { name: 'Preview suggestion', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Source: override' })).toContainText(
    'Resurrection',
  );
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Timezone', exact: true })).toHaveValue(
    'Pacific/Honolulu',
  );
  const memberContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
  try {
    const member = await memberContext.newPage();
    await login(member, 'viewer');
    const detail = await (await page.request.get(`/api/v1/choirs/${choir.id}/`)).json();
    const join = await member.request.post('/api/v1/choirs/requests/', {
      headers: { 'X-CSRFToken': await csrf(member) },
      data: { choir_id: choir.id, code: detail.code },
    });
    expect(join.status()).toBe(201);
    const { id: requestId } = await join.json();
    const approved = await page.request.post(
      `/api/v1/choirs/${choir.id}/requests/${requestId}/decide/`,
      {
        headers: { 'X-CSRFToken': await csrf(page) },
        data: { status: 'approved' },
      },
    );
    expect(approved.status()).toBe(204);
    await member.goto(url);
    await expect(member.getByText('Your choir planners manage these settings.')).toBeVisible();
    await expect(member.getByRole('combobox', { name: 'Calendar', exact: true })).toBeDisabled();
    await expect(
      member.getByRole('button', { name: 'Save calendar settings', exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await member.request.patch(api, {
          headers: { 'X-CSRFToken': await csrf(member) },
          data: { calendar: 'manual', time_zone: 'Asia/Beirut', version: 0 },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await member.request.post('/api/v1/genres/', {
          headers: { 'X-CSRFToken': await csrf(member) },
          data: { name: 'Forbidden' },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await memberContext.close();
  }
  await page.getByRole('button', { name: 'Remove override', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Confirm action' })
    .getByRole('button', { name: 'Remove override', exact: true })
    .click();
  await expect(page.getByText('No date overrides.', { exact: true })).toBeVisible();
  await page.getByLabel('Preview date', { exact: true }).fill('2027-03-28');
  await page.getByRole('button', { name: 'Preview suggestion', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Source: manual' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('choir-calendar.png'), fullPage: true });
  // Verify the planner can switch back to automatic suggestions.
  await page.getByRole('combobox', { name: 'Calendar', exact: true }).selectOption('maronite');
  await page.getByRole('combobox', { name: 'Timezone', exact: true }).selectOption('Asia/Beirut');
  await page.getByRole('button', { name: 'Save calendar settings', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Save calendar settings', exact: true }),
  ).toBeDisabled();
});
