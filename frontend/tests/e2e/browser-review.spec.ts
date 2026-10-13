/** Owner's October 10 review: real HTTP selection and two-step draft creation. */
import { expect, test } from '@playwright/test';
const suffix = process.env.E2E_USER_SUFFIX;
const password = process.env.E2E_PASSWORD;
if (!suffix || !password) throw new Error('Run through scripts/e2e.ps1.');
test('Browser review: duplicate date, compact inline picker, HTTP random selection and list cues', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.addInitScript(() =>
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
    }),
  );
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
  const prefix = `Browser review ${suffix}-${info.project.name}`;
  const existing = await page.request.post('/api/v1/masses/', {
    headers,
    data: { date: '2026-10-11', title: `${prefix} existing` },
  });
  expect(existing.status()).toBe(201);
  const season = (
    (await (await page.request.get('/api/v1/liturgical-seasons/')).json()) as {
      id: number;
      name: string;
    }[]
  ).find((row) => row.name === 'Holy Cross')!;
  const language = (await (await page.request.get('/api/v1/languages/')).json())[0];
  const placement = (
    (await (await page.request.get('/api/v1/mass-placements/')).json()) as {
      id: number;
      name: string;
    }[]
  ).find((row) => row.name === 'Communion')!;
  await page.goto('/masses');
  await page.getByRole('link', { name: 'Create Mass', exact: true }).click();
  await expect(page).toHaveURL(/\/masses\/new$/);
  await expect(page.getByLabel('Search Mass plans')).toHaveCount(0);
  await page.getByLabel('Date', { exact: true }).fill('2026-10-11');
  await page
    .getByRole('combobox', { name: 'Liturgical season', exact: true })
    .selectOption(String(season.id));
  const dateBox = (await page.getByLabel('Date', { exact: true }).boundingBox())!;
  const seasonBox = (await page
    .getByRole('combobox', { name: 'Liturgical season', exact: true })
    .boundingBox())!;
  expect(dateBox.height).toBe(44);
  expect(seasonBox.height).toBe(dateBox.height);
  await page.getByText('Title and notes (optional)', { exact: true }).click();
  const titleBox = (await page.getByLabel('Title', { exact: true }).boundingBox())!;
  const notesBox = (await page.getByLabel('Notes', { exact: true }).boundingBox())!;
  expect(notesBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);

  await page.getByLabel('Title', { exact: true }).fill(`${prefix} new`);
  let confirmations = 0;
  page.on('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Create another Mass for this date?');
    confirmations++;
    if (confirmations === 1) await dialog.dismiss();
    else await dialog.accept();
  });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect.poll(() => confirmations).toBe(1);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(`${prefix} new`);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/\/masses\/\d+\/edit$/);
  const id = Number(page.url().split('/').at(-2));
  await expect(page.getByRole('region', { name: 'Confirmed Mass details' })).toContainText(
    '2026-10-11 · Holy Cross',
  );
  await expect(page.getByLabel('Date', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Random hymns', exact: true }).click();
  await expect(page.locator('.random-picker [role="status"]')).toContainText('random hymn');
  await expect(page.locator('.random-picker [role="alert"]')).toHaveCount(0);
  for (const name of ['first', 'second']) {
    const hymn = await page.request.post('/api/v1/hymns/', {
      headers,
      data: {
        title: `${prefix} ${name}`,
        language_id: language.id,
        placement_ids: [placement.id],
        is_season_neutral: true,
        estimated_duration_minutes: '3',
        default_key: 'D',
        is_polyphonic: true,
        voices: ['Soprano', 'Alto'],
      },
    });
    expect(hymn.status()).toBe(201);
  }
  for (const name of ['first', 'second']) {
    await page.getByRole('button', { name: 'Add hymn to Communion', exact: true }).click();
    const picker = page.getByRole('region', { name: 'Add hymn to Communion', exact: true });
    await expect(picker).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(picker.getByLabel('Search hymns')).toBeFocused();
    const searchResults = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/hymns/') &&
        new URL(response.url()).searchParams.get('q') === prefix &&
        response.ok(),
    );
    await picker.getByLabel('Search hymns').fill(prefix);
    await searchResults;
    await expect(
      picker.getByRole('button', { name: `Choose ${prefix} ${name}`, exact: true }),
    ).toBeVisible();
    await expect(picker).toContainText('Soprano, Alto');
    await expect(picker).toContainText('Any season');
    if (name === 'first') await picker.screenshot({ path: info.outputPath('compact-picker.png') });
    await picker.getByRole('button', { name: 'Filters', exact: true }).click();
    await expect(picker.getByLabel('Language filter')).toBeVisible();
    await picker.getByRole('button', { name: `Choose ${prefix} ${name}`, exact: true }).click();
    if (await picker.getByRole('button', { name: 'Add anyway' }).isVisible())
      await picker.getByRole('button', { name: 'Add anyway' }).click();
    await expect(picker).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Add hymn to Communion', exact: true }),
    ).toBeFocused();
  }
  await page.getByRole('button', { name: `Edit ${prefix} first`, exact: true }).click();
  await page
    .getByRole('textbox', { name: `Selection notes for ${prefix} first` })
    .fill('Keep this performance note');
  await page.getByRole('button', { name: '← Back to Mass details' }).click();
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2026-10-11');
  await expect(page.getByRole('region', { name: 'Hymn program' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: `Selection notes for ${prefix} first` }),
  ).toHaveValue('Keep this performance note');
  const handle = page.getByRole('button', { name: `Reorder ${prefix} second`, exact: true });
  await handle.press('Space');
  await handle.press('ArrowUp');
  await handle.press('Space');
  await page.screenshot({ path: info.outputPath('inline-picker-flow.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/masses/${id}$`));
  const stored = await (await page.request.get(`/api/v1/masses/${id}/`)).json();
  expect(
    stored.program.some((row: { notes: string }) => row.notes === 'Keep this performance note'),
  ).toBe(true);
  await page.goto(`/masses?status=draft&q=${encodeURIComponent(prefix)}`);
  await expect(page.locator('.mass-card')).toHaveCount(2);
  await expect(page.getByText('End of matching Mass plans', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 520 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.getByRole('button', { name: 'Scroll to top', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Create Mass', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Scroll to top', exact: true })).toHaveCount(0);
});
