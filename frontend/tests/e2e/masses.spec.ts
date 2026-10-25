import { initialChoirId, selectInitialChoir } from './choir-context';
/** Real M3 workflow: persisted order/notes, failures, conflicts and role boundaries. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { nearestSunday } from '../../src/features/masses/calendar';

const suffix = process.env.E2E_USER_SUFFIX;
const password = process.env.E2E_PASSWORD;
if (!suffix || !password) throw new Error('Run through dev.cmd e2e.');

async function signIn(page: Page, role = 'Planner') {
  await page.goto('/');
  await page.getByLabel('Email or username').fill(`e2e-${suffix}-${role.toLowerCase()}`);
  await page.getByLabel('Password', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Masses',
      exact: true,
    }),
  ).toBeVisible();
}
async function csrf(page: Page) {
  const response = await page.request.get('/api/v1/auth/csrf/');
  return {
    'X-Choir-ID': await initialChoirId(page),
    'X-CSRFToken': (await response.json()).csrf_token as string,
  };
}
async function seedHymn(page: Page, title: string, placementName = 'Communion') {
  const languages = (await (await page.request.get('/api/v1/languages/')).json()) as {
    id: number;
  }[];
  const placements = (await (await page.request.get('/api/v1/mass-placements/')).json()) as {
    id: number;
    name: string;
  }[];
  const placement = placements.find((row) => row.name === placementName)!;
  const created = await page.request.post('/api/v1/hymns/', {
    headers: await csrf(page),
    data: {
      title,
      language_id: languages[0].id,
      placement_ids: [placement.id],
      is_season_neutral: true,
    },
  });
  expect(created.status()).toBe(201);
  return (await created.json()) as { id: number };
}
async function choose(page: Page, title: string, placement = 'Communion') {
  await page.getByRole('button', { name: `Add hymn to ${placement}`, exact: true }).click();
  const picker = page.locator('.inline-hymn-picker');
  if (placement !== 'Communion') {
    await picker.getByRole('button', { name: 'Filters', exact: true }).click();
    await picker.getByLabel('Search all placements').check();
  }
  await picker.getByLabel('Search hymns').fill(title);
  await picker.getByRole('button', { name: `Choose ${title}`, exact: true }).click();
}
async function saved(page: Page) {
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
}
async function editSelection(page: Page, title: string) {
  if (
    !(await page
      .getByRole('textbox', { name: `Selection notes for ${title}`, exact: true })
      .isVisible())
  ) {
    await page.getByRole('button', { name: `Edit ${title}`, exact: true }).click();
  }
}

test('Mass list: nearest upcoming first and past Masses archived at the end', async ({
  page,
}, info) => {
  await signIn(page);
  const prefix = `List order ${suffix}-${info.project.name}`;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Beirut',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const day = (offset: number) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const headers = await csrf(page);
  for (const [label, offset] of [
    ['Far', 14],
    ['Old', -14],
    ['Today', 0],
    ['Near', 1],
    ['Yesterday', -1],
  ] as const) {
    const response = await page.request.post('/api/v1/masses/', {
      headers,
      data: { date: day(offset), title: `${prefix} ${label}` },
    });
    expect(response.status()).toBe(201);
  }
  await page.goto('/masses');
  await page.getByRole('link', { name: 'Drafts', exact: true }).click();
  await page.getByLabel('Search Mass plans').fill(prefix);
  await expect(page.locator('.mass-card')).toHaveCount(5);
  await expect(page.locator('.mass-card h3')).toHaveText(
    ['Today', 'Near', 'Far', 'Yesterday', 'Old'].map((label) => `${prefix} ${label}`),
  );
  const upcoming = page.getByRole('region', { name: 'Today and upcoming', exact: true });
  const archived = page.getByRole('region', { name: 'Archived', exact: true });
  await expect(upcoming.locator('.mass-card')).toHaveCount(3);
  await expect(archived.locator('.mass-card')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('mass-list-order.png'), fullPage: true });
  await archived.getByRole('link', { name: new RegExp(`${prefix} Yesterday`) }).click();
  await expect(page.getByText('Saved draft', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit Mass', exact: true })).toBeVisible();
});

test('Section picker and saved view: preference, scrolling, failed save and edit reentry', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await signIn(page);
  const prefix = `Picker review ${suffix}-${info.project.name}`;
  const languages = (await (await page.request.get('/api/v1/languages/')).json()) as {
    id: number;
  }[];
  const placements = (await (await page.request.get('/api/v1/mass-placements/')).json()) as {
    id: number;
    name: string;
  }[];
  const seasons = (await (await page.request.get('/api/v1/liturgical-seasons/')).json()) as {
    id: number;
    name: string;
  }[];
  const slot = placements.find((row) => row.name === 'Communion')!;
  const entrance = placements.find((row) => row.name === 'Entrance / Processional')!;
  const season = seasons.find((row) => row.name === 'Holy Cross')!;
  const otherSeason = seasons.find((row) => row.name === 'Epiphany')!;
  const headers = await csrf(page);
  const matching = `${prefix} Z matching`;
  const neutral = `${prefix} Z neutral`;
  for (const [title, placement, seasonId] of [
    [matching, slot.id, season.id],
    [neutral, slot.id, null],
    [`${prefix} A wrong section`, entrance.id, null],
    ...Array.from({ length: 26 }, (_, i) => [`${prefix} A other ${i}`, slot.id, otherSeason.id]),
  ] as [string, number, number | null][]) {
    const response = await page.request.post('/api/v1/hymns/', {
      headers,
      data: {
        title,
        language_id: languages[0].id,
        placement_ids: [placement],
        is_season_neutral: seasonId === null,
        season_ids: seasonId ? [seasonId] : [],
      },
    });
    expect(response.status()).toBe(201);
  }
  const created = await page.request.post('/api/v1/masses/', {
    headers,
    data: { date: '2026-10-11', liturgical_season_id: season.id, notes: 'Saved Mass instructions' },
  });
  const mass = (await created.json()) as { id: number };
  await page.goto(`/masses/${mass.id}/edit`);
  if (await page.getByRole('button', { name: 'Next', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Add hymn to Communion', exact: true }).click();
  const picker = page.locator('.inline-hymn-picker');
  await picker.getByLabel('Search hymns').fill(prefix);
  await expect(picker.locator('.picker-result-row').first()).toContainText(matching);
  await expect(picker.locator('.picker-result-row').nth(1)).toContainText(neutral);
  await expect(
    picker.getByRole('button', { name: `Choose ${prefix} A wrong section`, exact: true }),
  ).toHaveCount(0);
  await picker.locator('.picker-result-row').first().hover();
  await page.mouse.wheel(0, 600);
  if (info.project.name === 'desktop') {
    // Desktop rows grow with the page instead of a second vertical scroll region.
    expect(
      await picker
        .locator('.picker-result-scroll')
        .evaluate((node) => node.scrollHeight - node.clientHeight),
    ).toBeLessThanOrEqual(1);
  } else {
    await expect
      .poll(() => picker.locator('.picker-result-scroll').evaluate((node) => node.scrollTop))
      .toBeGreaterThan(0);
    expect(
      await picker
        .locator('.picker-result-scroll')
        .evaluate((node) => node.clientHeight < node.scrollHeight),
    ).toBe(true);
  }
  await picker.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(picker.getByText('Page 2', { exact: true })).toBeVisible();
  await expect(picker.locator('.picker-result-row')).toHaveCount(3);
  await picker.getByRole('button', { name: 'Previous', exact: true }).click();
  await picker.getByRole('button', { name: `Choose ${matching}`, exact: true }).click();
  await saved(page);
  await editSelection(page, matching);
  await page.route(
    `**/api/v1/masses/${mass.id}/program/`,
    (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'Temporary save failure.',
          code: 'unavailable',
          errors: {},
        }),
      }),
    { times: 1 },
  );
  await page
    .getByRole('textbox', { name: `Selection notes for ${matching}`, exact: true })
    .fill('Keep final selection notes');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(
    page.getByRole('textbox', { name: `Selection notes for ${matching}`, exact: true }),
  ).toHaveValue('Keep final selection notes');
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await saved(page);

  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route(
    `**/api/v1/masses/${mass.id}/program/`,
    async (route) => {
      started();
      await held;
      await route.continue();
    },
    { times: 1 },
  );
  await page
    .getByRole('textbox', { name: `Selection notes for ${matching}`, exact: true })
    .fill('Final choir note');
  await requestStarted;
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saving draft…', exact: true })).toBeDisabled();
  await expect(page).toHaveURL(/\/edit$/);
  release();
  await expect(page).toHaveURL(new RegExp(`/masses/${mass.id}$`));
  await expect(page.getByText('Saved draft', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Saved hymn program' })).toContainText(
    'Final choir note',
  );
  await expect(page.getByText('Saved Mass instructions')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Random hymns', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Entrance / Processional', exact: true }),
  ).toContainText('Hymn not selected');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('saved-mass-view.png'), fullPage: true });
  await page.reload();
  await page.getByRole('link', { name: 'Edit Mass', exact: true }).click();
  await editSelection(page, matching);
  await expect(
    page.getByRole('textbox', { name: `Selection notes for ${matching}`, exact: true }),
  ).toHaveValue('Final choir note');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/masses/${mass.id}$`));
  await page.getByRole('link', { name: '← Mass plans', exact: true }).click();
  await page.getByRole('link', { name: 'Drafts', exact: true }).click();
  await page.getByLabel('Search Mass plans').fill('Sunday Mass');
  await page.locator(`.mass-card a[href="/masses/${mass.id}"]`).click();
  await expect(page.getByRole('link', { name: 'Edit Mass', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
});

test('Random picker: matching choices, retained notes, failed save retry and reload', async ({
  page,
}, info) => {
  await signIn(page);
  const manualTitle = `Random retained ${suffix}-${info.project.name}`;
  const manual = await seedHymn(page, manualTitle);
  await seedHymn(page, `Random entrance ${suffix}-${info.project.name}`, 'Entrance / Processional');
  await seedHymn(page, `Random offertory ${suffix}-${info.project.name}`, 'Offertory');
  const seasons = (await (await page.request.get('/api/v1/liturgical-seasons/')).json()) as {
    id: number;
    name: string;
  }[];
  const season = seasons.find((row) => row.name === 'Holy Cross')!;
  const created = await page.request.post('/api/v1/masses/', {
    headers: await csrf(page),
    data: { date: '2026-10-11', liturgical_season_id: season.id },
  });
  expect(created.status()).toBe(201);
  const mass = (await created.json()) as { id: number };
  await page.goto(`/masses/${mass.id}/edit`);
  await choose(page, manualTitle);
  await saved(page);
  await editSelection(page, manualTitle);
  await page
    .getByRole('textbox', { name: `Selection notes for ${manualTitle}`, exact: true })
    .fill('Keep choir instructions');
  await saved(page);
  const before = (await (await page.request.get(`/api/v1/masses/${mass.id}/`)).json()) as {
    program: { id: number }[];
  };

  await page.route(`**/api/v1/masses/${mass.id}/program/`, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Temporary save failure.', code: 'unavailable', errors: {} }),
    }),
  );
  const randomButton = page.getByRole('button', { name: 'Random hymns', exact: true });
  await randomButton.click();
  await expect(page.getByText(/\d+ random hymns? added\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: `Selection notes for ${manualTitle}`, exact: true }),
  ).toHaveValue('Keep choir instructions');
  await page.unroute(`**/api/v1/masses/${mass.id}/program/`);
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await saved(page);
  const savedMass = (await (await page.request.get(`/api/v1/masses/${mass.id}/`)).json()) as {
    program: {
      id: number;
      placement: { id: number };
      hymn: {
        id: number;
        is_active: boolean;
        is_season_neutral: boolean;
        seasons: { id: number; slug: string }[];
        placements: { id: number }[];
      };
      notes: string | null;
    }[];
  };
  expect(savedMass.program.length).toBeGreaterThan(1);
  expect(new Set(savedMass.program.map((row) => row.hymn.id)).size).toBe(savedMass.program.length);
  const retained = savedMass.program.find((row) => row.hymn.id === manual.id)!;
  expect(retained.id).toBe(before.program[0].id);
  expect(retained.notes).toBe('Keep choir instructions');
  for (const row of savedMass.program) {
    expect(row.hymn.is_active).toBe(true);
    expect(row.hymn.placements.some((slot) => slot.id === row.placement.id)).toBe(true);
    expect(
      row.hymn.is_season_neutral ||
        row.hymn.seasons.some((item) => item.id === season.id || item.slug === 'ordinary-time'),
    ).toBe(true);
  }
  await page.reload();
  await saved(page);
  await expect(page.locator('.program-row')).toHaveCount(savedMass.program.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('random-picker.png'), fullPage: true });
});

test('Planner: multiple rows, reorder, retry, conflict review, and navigation guard', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await signIn(page);
  const first = `Mass hymn A ${suffix}-${info.project.name}`;
  const second = `Mass hymn B ${suffix}-${info.project.name}`;
  const programTitle = `Wednesday program ${suffix}-${info.project.name}`;
  await seedHymn(page, first);
  await seedHymn(page, second);
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('/masses');
  await page.getByRole('link', { name: 'New Mass', exact: true }).click();
  await page.getByLabel('Date', { exact: true }).fill('2026-10-07');
  await page.getByText('Title and notes (optional)', { exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill(programTitle);
  await page
    .getByRole('combobox', { name: 'Liturgical season', exact: true })
    .selectOption({ label: 'Easter' });
  await page.locator('#create-mass').getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/\/masses\/\d+\/edit$/);
  await saved(page);
  await choose(page, first);
  await saved(page);
  await choose(page, second);
  await saved(page);
  await editSelection(page, second);
  await page
    .getByRole('textbox', { name: `Selection notes for ${second}`, exact: true })
    .fill('Second hymn moved first');
  const reorder = page.getByRole('button', { name: `Reorder ${second}`, exact: true });
  await reorder.press('Space');
  await reorder.press('ArrowUp');
  await reorder.press('Space');
  await saved(page);
  await page.reload();
  await editSelection(page, second);
  await expect(page.getByRole('region', { name: 'Confirmed Mass details' })).toContainText(
    '2026-10-07 · Easter',
  );
  const communion = page.getByRole('region', { name: 'Communion', exact: true });
  await expect(communion.getByRole('listitem').first()).toContainText(second);
  await expect(
    page.getByRole('textbox', { name: `Selection notes for ${second}`, exact: true }),
  ).toHaveValue('Second hymn moved first');
  await choose(page, first, 'Entrance / Processional');
  await expect(page.getByRole('region', { name: 'Selection warnings' })).toContainText(
    'Not classified for Entrance / Processional.',
  );
  await expect(page.getByRole('region', { name: 'Selection warnings' })).toContainText(
    'Already selected in this program.',
  );
  await expect(page.getByRole('button', { name: 'Cancel choice', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Add anyway', exact: true })).toBeInViewport();
  expect(
    await page
      .getByRole('region', { name: 'Selection warnings' })
      .locator('.form-actions')
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toBe('rgba(0, 0, 0, 0)');
  await page.screenshot({
    path: `test-results/${info.project.name}-mass-warning.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Add anyway', exact: true }).click();
  await saved(page);
  await expect(page.getByRole('region', { name: 'Program warnings' })).toContainText(
    `${first} appears more than once in this program.`,
  );
  await page
    .getByRole('region', { name: 'Entrance / Processional', exact: true })
    .getByRole('button', { name: `Remove ${first}`, exact: true })
    .click();
  await saved(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-mass-planner.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.route(
    '**/api/v1/masses/*/program/',
    (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'Temporary save failure.',
          code: 'service_unavailable',
          errors: {},
        }),
      }),
    { times: 1 },
  );
  await page
    .getByRole('textbox', { name: `Selection notes for ${second}`, exact: true })
    .fill('Kept after failure');
  await expect(page.getByRole('alert')).toContainText('Your local edits have been kept.');
  await expect(
    page.getByRole('textbox', { name: `Selection notes for ${second}`, exact: true }),
  ).toHaveValue('Kept after failure');
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await saved(page);
  await page.getByRole('link', { name: '← Mass plans', exact: true }).click();
  await page.getByRole('link', { name: 'Drafts', exact: true }).click();
  await page.getByLabel('Search Mass plans').fill(programTitle);
  await page.getByRole('link', { name: new RegExp(programTitle) }).click();
  await page.getByRole('link', { name: 'Edit Mass', exact: true }).click();
  await saved(page);
  await editSelection(page, second);
  await expect(
    page.getByRole('textbox', { name: `Selection notes for ${second}`, exact: true }),
  ).toHaveValue('Kept after failure');

  const other = await page.context().newPage();
  await other.goto(page.url());
  await saved(other);
  await editSelection(other, second);
  await page
    .getByRole('textbox', { name: `Selection notes for ${second}`, exact: true })
    .fill('Winning version');
  await saved(page);
  await other
    .getByRole('textbox', { name: `Selection notes for ${second}`, exact: true })
    .fill('Conflicting local version');
  await expect(other.getByRole('alert')).toContainText('Another planner changed this Mass');
  await expect(
    other.getByRole('textbox', { name: `Selection notes for ${second}`, exact: true }),
  ).toHaveValue('Conflicting local version');
  await other.getByRole('button', { name: 'Review saved version' }).click();
  await expect(other.getByRole('region', { name: 'Saved version' })).toContainText(
    'Winning version',
  );
  other.once('dialog', (dialog) => void dialog.accept());
  await other.getByRole('button', { name: 'Discard local edits and reload' }).click();
  await saved(other);
  await editSelection(other, second);
  await expect(
    other.getByRole('textbox', { name: `Selection notes for ${second}`, exact: true }),
  ).toHaveValue('Winning version');
  await other.close();

  let release!: () => void;
  let requestStarted!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  await page.route(
    '**/api/v1/masses/*/program/',
    async (route) => {
      requestStarted();
      await held;
      await route.continue();
    },
    { times: 1 },
  );
  await page
    .getByRole('textbox', { name: `Selection notes for ${second}`, exact: true })
    .fill('Pending navigation edit');
  await started;
  await page.getByRole('link', { name: '← Mass plans', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveText(/Leave unsaved draft/);
  await page.getByRole('button', { name: 'Stay here' }).click();
  release();
  await saved(page);

  await page.getByRole('button', { name: `Remove ${first}`, exact: true }).click();
  await saved(page);
  const url = page.url();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByLabel('Email or username').fill(`e2e-${suffix}-viewer`);
  await page.getByLabel('Password', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
  await selectInitialChoir(page);
  await page.goto(url);
  await expect(page).toHaveURL(url.replace(/\/edit$/, ''));
  await expect(page.getByRole('link', { name: 'Edit Mass', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Add hymn to Communion', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('link', { name: first, exact: true })).toHaveCount(0);
  const denied = await page.request.put(
    `${new URL(url).pathname.replace(/\/edit$/, '')}/program/`.replace(
      '/masses/',
      '/api/v1/masses/',
    ),
    {
      headers: { ...(await csrf(page)), 'X-Expected-Mass-Revision': '1' },
      data: { selections: [] },
    },
  );
  expect(denied.status()).toBe(403);
});

test('Admin: draft deletion is confirmed with Cancel as default focus', async ({ page }) => {
  await signIn(page, 'Admin');
  const response = await page.request.post('/api/v1/masses/', {
    headers: await csrf(page),
    data: { date: '2026-10-08', title: `Delete draft ${suffix}` },
  });
  expect(response.status()).toBe(201);
  const mass = (await response.json()) as { id: number };
  await page.goto(`/masses/${mass.id}/edit`);
  await saved(page);
  await page.getByRole('button', { name: 'Delete draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Delete draft', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm deletion' }).click();
  await expect(page).toHaveURL(/\/masses$/);
  expect((await page.request.get(`/api/v1/masses/${mass.id}/`)).status()).toBe(404);
});

test('Planner: optional details, create retry, saved filters, and picker sorting', async ({
  page,
}, info) => {
  await signIn(page);
  const title = `Simple draft ${suffix}-${info.project.name}`;
  const hymn = `Picker hymn ${suffix}-${info.project.name}`;
  await seedHymn(page, hymn);
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('/masses');
  await page.getByRole('link', { name: 'New Mass', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toBeHidden();
  await page.getByLabel('Date', { exact: true }).fill('2026-10-08');
  await page.getByText('Title and notes (optional)', { exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Notes', { exact: true }).fill('Keep these Mass notes');
  await page.route(
    '**/api/v1/masses/',
    (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Temporary create failure.', code: 'service_unavailable' }),
      });
    },
    { times: 1 },
  );
  await page.locator('#create-mass').getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your input has been kept.');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(title);
  await page.locator('#create-mass').getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/\/masses\/\d+\/edit$/);
  await saved(page);
  await page.getByRole('button', { name: '← Back to Mass details' }).click();
  await page.getByText('Title and Mass notes', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Mass notes', exact: true })).toHaveValue(
    'Keep these Mass notes',
  );
  if (await page.getByRole('button', { name: 'Next', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Add hymn to Communion', exact: true }).click();
  const picker = page.locator('.inline-hymn-picker');
  await expect(picker.getByLabel('Search hymns')).toBeFocused();
  await expect(picker).toContainText('Holy Cross / neutral first');
  await picker.getByLabel('Search hymns').fill(hymn);
  await picker.getByRole('button', { name: 'Filters', exact: true }).click();
  const sorted = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/hymns/') &&
      response.url().includes('ordering=newest_added') &&
      response.ok(),
  );
  await picker.getByLabel('Sort hymns').selectOption('newest_added');
  await sorted;
  await picker.getByRole('button', { name: `Choose ${hymn}`, exact: true }).click();
  await saved(page);
  const addButton = page.getByRole('button', { name: 'Add hymn to Communion', exact: true });
  await expect(addButton).toHaveText('+');
  await editSelection(page, hymn);
  await page
    .getByRole('textbox', { name: `Selection notes for ${hymn}`, exact: true })
    .fill('Keep selection notes when replacing');
  await saved(page);
  const replacement = `Replacement ${suffix}-${info.project.name}`;
  await seedHymn(page, replacement);
  await page.getByRole('button', { name: 'Change hymn', exact: true }).click();
  await page.locator('.inline-hymn-picker').getByLabel('Search hymns').fill(replacement);
  await page.getByRole('button', { name: `Choose ${replacement}`, exact: true }).click();
  await saved(page);
  await expect(
    page.getByRole('textbox', { name: `Selection notes for ${replacement}`, exact: true }),
  ).toHaveValue('Keep selection notes when replacing');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(
    page.getByRole('button', { name: `Reorder ${replacement}`, exact: true }),
  ).toHaveCount(0);
  const edit = await page
    .getByRole('button', { name: `Edit ${replacement}`, exact: true })
    .boundingBox();
  const remove = await page
    .getByRole('button', { name: `Remove ${replacement}`, exact: true })
    .boundingBox();
  expect(remove!.y).toBe(edit!.y);
  expect(remove!.x).toBeGreaterThanOrEqual(edit!.x + edit!.width);
  await page.getByRole('button', { name: `Remove ${replacement}`, exact: true }).click();
  await saved(page);
  await expect(page.getByRole('link', { name: replacement, exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: '← Mass plans', exact: true }).click();
  await page.getByRole('link', { name: 'Drafts', exact: true }).click();
  await page.getByLabel('Search Mass plans').fill(title);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByLabel('From date').fill('2026-10-08');
  await page.getByLabel('To date').fill('2026-10-08');
  await page.reload();
  await expect(page.getByLabel('From date')).toHaveValue('2026-10-08');
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
  await page.getByLabel('Search Mass plans').fill(`No matching Mass ${suffix}`);
  await expect(
    page.getByText('No Mass plans match these filters.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page).toHaveURL(/\/masses\?status=draft$/);
  await expect(page.getByLabel('Search Mass plans')).toHaveValue('');
  await page.getByLabel('Search Mass plans').fill(title);
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-mass-list.png`,
    fullPage: true,
  });
});

test('Planner: generated titles and background reference refresh preserve pending edits', async ({
  page,
  browser,
}, info) => {
  const title = `Refresh draft ${suffix}-${info.project.name}`;
  const hymnTitle = `Refresh hymn ${suffix}-${info.project.name}`;
  const renamed = `${hymnTitle} renamed`;
  await signIn(page);
  const hymn = await seedHymn(page, hymnTitle);
  const response = await page.request.post('/api/v1/masses/', {
    headers: await csrf(page),
    data: { date: '2026-10-08', title },
  });
  expect(response.status()).toBe(201);
  const mass = (await response.json()) as { id: number };
  await page.goto(`/masses/${mass.id}/edit`);
  await saved(page);
  await choose(page, hymnTitle);
  await saved(page);
  await page.getByRole('button', { name: '← Back to Mass details' }).click();
  await page.getByText('Title and Mass notes', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('');
  await saved(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Sunday Mass — October 08, 2026',
  );
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
    'Sunday Mass — October 08, 2026',
  );

  const adminContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const admin = await adminContext.newPage();
    await signIn(admin, 'Admin');
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    await page.route(
      '**/api/v1/masses/*/program/',
      async (route) => {
        requestStarted();
        await held;
        await route.continue();
      },
      { times: 1 },
    );
    await page.bringToFront();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await editSelection(page, hymnTitle);
    await page
      .getByRole('textbox', {
        name: `Selection notes for ${hymnTitle}`,
        exact: true,
      })
      .fill('Keep my local selection notes');
    await started;
    const updated = await admin.request.patch(`/api/v1/hymns/${hymn.id}/`, {
      headers: await csrf(admin),
      data: { title: renamed, is_active: false },
    });
    expect(updated.status()).toBe(200);
    const refreshed = page.waitForResponse(
      (result) =>
        result.url().endsWith(`/api/v1/masses/${mass.id}/`) &&
        result.request().method() === 'GET' &&
        result.ok(),
    );
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await refreshed;
    await expect(page.getByRole('link', { name: renamed, exact: true })).toBeVisible();
    await expect(
      page.getByRole('textbox', {
        name: `Selection notes for ${renamed}`,
        exact: true,
      }),
    ).toHaveValue('Keep my local selection notes');
    await expect(page.getByText('Inactive hymn retained', { exact: false })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Program warnings' })).toContainText(renamed);
    await expect(page.getByText('Saving', { exact: true })).toBeVisible();
    release();
    await saved(page);
    await page.reload();
    await editSelection(page, renamed);
    await expect(
      page.getByRole('textbox', {
        name: `Selection notes for ${renamed}`,
        exact: true,
      }),
    ).toHaveValue('Keep my local selection notes');
  } finally {
    release();
    await adminContext.close();
  }
});

test('Planner: nearest Sunday, Maronite date selection and manual season override', async ({
  page,
}, info) => {
  await signIn(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-workspace.png`,
    fullPage: true,
  });
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('/masses');
  await page.getByRole('link', { name: 'New Mass', exact: true }).click();
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue(nearestSunday());
  await expect(page.getByRole('combobox', { name: 'Liturgical season', exact: true })).toHaveValue(
    /\d+/,
  );
  await page.getByLabel('Date', { exact: true }).fill('2026-04-05');
  await expect(page.getByRole('combobox', { name: 'Liturgical season', exact: true })).toHaveValue(
    (await page
      .getByRole('combobox', { name: 'Liturgical season', exact: true })
      .getByRole('option', { name: 'Resurrection', exact: true })
      .getAttribute('value'))!,
  );
  await page.locator('#create-mass').getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/\/masses\/\d+\/edit$/);
  await saved(page);
  await page.getByRole('button', { name: '← Back to Mass details' }).click();
  await page.getByLabel('Date', { exact: true }).fill('2026-09-14');
  await saved(page);
  await expect(page.getByRole('combobox', { name: 'Liturgical season', exact: true })).toHaveValue(
    (await page
      .getByRole('combobox', { name: 'Liturgical season', exact: true })
      .getByRole('option', { name: 'Holy Cross', exact: true })
      .getAttribute('value'))!,
  );
  await page
    .getByRole('combobox', { name: 'Liturgical season', exact: true })
    .selectOption({ label: 'Pentecost' });
  await saved(page);
  await page.reload();
  await page.getByRole('button', { name: '← Back to Mass details' }).click();
  await expect(page.getByRole('combobox', { name: 'Liturgical season', exact: true })).toHaveValue(
    (await page
      .getByRole('combobox', { name: 'Liturgical season', exact: true })
      .getByRole('option', { name: 'Pentecost', exact: true })
      .getAttribute('value'))!,
  );
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2026-09-14');
});
