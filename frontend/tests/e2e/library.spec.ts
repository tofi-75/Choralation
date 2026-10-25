/** Library/review flows. Every created hymn/PDF belongs to a temporary run user. */
import { expect, test } from '@playwright/test';

const suffix = process.env.E2E_USER_SUFFIX;
const password = process.env.E2E_PASSWORD;
if (!suffix || !password) throw new Error('Run through dev.cmd e2e.');
const tags = [
  'Mary',
  'Eucharist',
  'Resurrection',
  'Peace',
  'Youth',
  'Procession',
  'Prayer',
  'Joy',
  'Repentance',
];

async function choose(
  scope: import('@playwright/test').Page | import('@playwright/test').Locator,
  group: string,
  names: string[],
) {
  const picker = scope.getByRole('group', { name: group, exact: true });
  const toggle = picker.getByRole('button', { name: /^Choose / });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  for (const name of names) await picker.getByRole('checkbox', { name, exact: true }).check();
}

async function signIn(page: import('@playwright/test').Page, role: string) {
  await page.goto('/hymns');
  await page.getByLabel('Email or username').fill(`e2e-${suffix}-${role.toLowerCase()}`);
  await page.getByLabel('Password', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Masses',
      exact: true,
    }),
  ).toBeVisible();
  await page.goto('/hymns');
  await expect(page.getByRole('heading', { name: 'Hymn library', exact: true })).toBeVisible();
}

test('Planner: create Unicode hymn, save recovery, URL filters, refresh, and edit', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await signIn(page, 'Planner');
  await page.getByRole('link', { name: 'Add hymn', exact: true }).click();
  const title = `ترنيمة القيامة — ${suffix}-${testInfo.project.name}`;
  await page.getByRole('textbox', { name: /^Title/ }).fill(title);
  await page.getByRole('combobox', { name: /^Language/ }).selectOption({ label: 'Arabic' });
  await choose(page, 'Genres', ['Traditional']);
  await choose(page, 'Suitable placements', ['Communion', 'Thanksgiving']);
  await choose(page, 'Suitable seasons', ['Easter']);
  await choose(page, 'Tags', tags);
  await page.getByText('More hymn details').click();
  await page.getByRole('textbox', { name: 'Alternate title' }).fill('ܩܠܐ');
  await page.getByRole('textbox', { name: 'Notes' }).fill('Line one\nLine two');
  await page.getByRole('spinbutton', { name: 'Duration (minutes)' }).fill('3.50');
  await page.getByRole('checkbox', { name: 'Polyphony (multiple voices)' }).check();
  for (const [index, voice] of ['Soprano', 'Alto'].entries()) {
    await page.getByRole('button', { name: 'Add voice', exact: true }).click();
    await page.getByRole('textbox', { name: `Voice ${index + 1}`, exact: true }).fill(voice);
  }
  await page
    .getByLabel('Sheet music PDF', { exact: true })
    .setInputFiles('tests/fixtures/sheet-music.pdf');
  await page.getByText('More hymn details').click();
  for (const label of ['genres', 'suitable placements', 'suitable seasons', 'tags'])
    await page.getByRole('button', { name: new RegExp(`^Choose ${label} `) }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  if (testInfo.project.name.startsWith('mobile')) {
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: viewport.width, height: 500 });
    await page.getByRole('textbox', { name: 'Voice 1', exact: true }).focus();
    await expect(page.getByRole('button', { name: 'Save hymn', exact: true })).toBeInViewport();
    await page.setViewportSize(viewport);
  }
  if (process.env.E2E_CAPTURE_PREVIEW === 'true')
    await page.screenshot({
      path: `test-results/${testInfo.project.name}-hymn-form.png`,
      fullPage: true,
    });
  await page.getByLabel('Sheet music PDF', { exact: true }).setInputFiles({
    name: 'invalid.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('not a PDF'),
  });
  await page.getByRole('button', { name: 'Save hymn', exact: true }).click();
  await expect(
    page.getByText('This file does not have valid PDF framing.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Voice 2', exact: true })).toHaveValue('Alto');
  await page
    .getByLabel('Sheet music PDF', { exact: true })
    .setInputFiles('tests/fixtures/sheet-music.pdf');
  await page.route('**/api/v1/hymns/', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'Temporary save failure.',
          code: 'server_error',
          errors: {},
        }),
      });
      await page.unroute('**/api/v1/hymns/');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Save hymn', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your input has been kept');
  await expect(page.getByRole('textbox', { name: /^Title/ })).toHaveValue(title);
  await page.getByRole('button', { name: 'Save hymn', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const detailUrl = page.url();
  await page.reload();
  await expect(page.getByText('ܩܠܐ', { exact: true })).toBeVisible();
  await expect(page.getByText('3.50 minutes', { exact: true })).toBeVisible();
  await expect(page.getByText('Soprano', { exact: true })).toBeVisible();
  await expect(page.getByText('Alto', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show 6 more', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show 6 more', exact: true }).click();
  await expect(page.getByText('Repentance', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show fewer', exact: true }).click();
  const pdfLink = page.getByRole('link', { name: 'Download PDF', exact: true });
  const pdfResponse = await page.request.get((await pdfLink.getAttribute('href'))!);
  expect(pdfResponse.status()).toBe(200);
  expect((await pdfResponse.body()).subarray(0, 5).toString()).toBe('%PDF-');
  await expect(page.getByRole('button', { name: 'Deactivate hymn' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Edit hymn', exact: true }).click();
  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.getByRole('checkbox', { name: 'Polyphony (multiple voices)' }).click();
  await expect(page.getByRole('checkbox', { name: 'Polyphony (multiple voices)' })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Voice 2', exact: true })).toHaveValue('Alto');
  await page.getByText('More hymn details').click();
  await page.getByRole('textbox', { name: 'Composer' }).fill(`Composer ${suffix}`);
  await page.getByRole('button', { name: 'Save hymn', exact: true }).click();
  await expect(page.getByText(`Composer ${suffix}`, { exact: true })).toBeVisible();
  if (process.env.E2E_CAPTURE_PREVIEW === 'true')
    await page.screenshot({
      path: `test-results/${testInfo.project.name}-hymn-detail.png`,
      fullPage: true,
    });
  await page.goto('/hymns');
  await page.getByRole('searchbox', { name: 'Search hymns' }).fill(title);
  await expect(page).toHaveURL(/q=/);
  if (testInfo.project.name.startsWith('mobile'))
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
  else {
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).not.toBeVisible();
    await page.getByText('Classification filters', { exact: true }).click();
  }
  const filterRegion = testInfo.project.name.startsWith('mobile')
    ? page.getByRole('dialog', { name: 'Filter hymns' })
    : page.locator('.desktop-filters');
  await choose(filterRegion, 'Genres', ['Traditional']);
  await choose(filterRegion, 'Placements', ['Communion']);
  await choose(filterRegion, 'Languages', ['Arabic']);
  await choose(filterRegion, 'Seasons', ['Easter']);
  await choose(filterRegion, 'Tags', tags);
  if (testInfo.project.name.startsWith('mobile'))
    await page.getByRole('button', { name: 'Show results', exact: true }).click();
  await expect(
    page.getByRole('link', { name: title, exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const filteredUrl = page.url();
  expect(filteredUrl).toContain('languages=');
  await page.reload();
  await expect(
    page.getByRole('link', { name: title, exact: true }).filter({ visible: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  if (process.env.E2E_CAPTURE_PREVIEW === 'true')
    await page.screenshot({
      path: `test-results/${testInfo.project.name}-library.png`,
      fullPage: true,
    });
  await page.getByRole('button', { name: 'Clear filters', exact: true }).first().click();
  expect(new URL(page.url()).search).toBe('');
  await page.goBack();
  await expect(page).toHaveURL(filteredUrl);
  await expect(page.getByRole('searchbox', { name: 'Search hymns' })).toHaveValue(title);
  await page.goto(detailUrl);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
});

test('Member: private creation is available while shared hymns remain read-only', async ({
  page,
}) => {
  await signIn(page, 'Viewer');
  await expect(page.getByRole('link', { name: 'Add hymn', exact: true })).toBeVisible();
  await page.goto('/hymns/new');
  await expect(page.getByRole('heading', { name: 'Add hymn', exact: true })).toBeVisible();
  await expect(page.getByText(/This hymn is private to your account/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save hymn' })).toBeVisible();
  const csrf = (await (await page.request.get('/api/v1/auth/csrf/')).json()).csrf_token;
  const forbidden = await page.request.post('/api/v1/hymns/', {
    headers: { 'X-CSRFToken': csrf },
    data: { title: 'Forbidden' },
  });
  expect(forbidden.status()).toBe(400);
  const hymns = (await (await page.request.get('/api/v1/hymns/?is_active=all')).json()).results;
  if (hymns.length) {
    await page.goto(`/hymns/${hymns[0].id}/edit`);
    await expect(page.getByRole('heading', { name: 'Read-only access' })).toBeVisible();
    expect(
      (
        await page.request.patch(`/api/v1/hymns/${hymns[0].id}/`, {
          headers: { 'X-CSRFToken': csrf },
          data: { title: 'Unauthorized edit' },
        })
      ).status(),
    ).toBe(403);
  }
  const attached = hymns.find(
    (hymn: { sheet_music_pdf: { url: string } | null }) => hymn.sheet_music_pdf,
  );
  if (attached) expect((await page.request.get(attached.sheet_music_pdf.url)).status()).toBe(200);
});

test('Admin: confirmation cancel, deactivate/reactivate, and safe delete', async ({
  page,
}, testInfo) => {
  await signIn(page, 'Admin');
  await page.getByRole('link', { name: 'Add hymn', exact: true }).click();
  const title = `Fictional admin test ${suffix}-${testInfo.project.name}`;
  await page.getByRole('textbox', { name: /^Title/ }).fill(title);
  await page.getByRole('combobox', { name: /^Language/ }).selectOption({ label: 'English' });
  await choose(page, 'Suitable placements', ['Communion']);
  await choose(page, 'Suitable seasons', ['Ordinary Time']);
  await page.getByRole('button', { name: 'Save hymn', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const detailUrl = page.url();
  await page.getByRole('button', { name: 'Deactivate hymn', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Deactivate hymn?' });
  await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Deactivate hymn', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Deactivate hymn', exact: true }).click();
  await confirm.getByRole('button', { name: 'Deactivate hymn', exact: true }).click();
  await expect(
    page.getByText('This hymn is inactive. Its saved information is retained.'),
  ).toBeVisible();
  await page.goto(`/hymns?is_active=false&q=${encodeURIComponent(title)}`);
  await expect(
    page.getByRole('link', { name: title, exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.goto(detailUrl);
  await page.getByRole('button', { name: 'Reactivate hymn', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Reactivate hymn', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Deactivate hymn', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete hymn', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete hymn', exact: true }).click();
  await expect(page).toHaveURL(/\/hymns$/);
  const missing = await page.request.get(
    new URL(detailUrl).pathname.replace('/hymns/', '/api/v1/hymns/') + '/',
  );
  expect(missing.status()).toBe(404);
});
