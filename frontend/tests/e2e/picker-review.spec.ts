/** Owner review: responsive metadata, neutral suitability and persisted mouse/touch drag. */
import { expect, test } from '@playwright/test';
const suffix = process.env.E2E_USER_SUFFIX;
const password = process.env.E2E_PASSWORD;
if (!suffix || !password) throw new Error('Run through scripts/e2e.ps1.');
test('Picker review: columns, compact controls, sidebar and drag keep identities and notes', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await page.getByLabel('Username').fill(`e2e-${suffix}-planner`);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
  if (info.project.name === 'desktop') {
    const width = await page.locator('.page-content').evaluate((node) => node.clientWidth);
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
    expect(
      await page.locator('.page-content').evaluate((node) => node.clientWidth),
    ).toBeGreaterThan(width);
    await page
      .getByRole('navigation', { name: 'Main', exact: true })
      .getByRole('link', { name: 'Mass plans', exact: true })
      .click();
    await expect(page).toHaveURL(/\/masses$/);
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
  }
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 899, height: 900 });
  const headers = {
    'X-CSRFToken': (await (await page.request.get('/api/v1/auth/csrf/')).json())
      .csrf_token as string,
  };
  const categories = async (kind: string) =>
    (await (await page.request.get(`/api/v1/${kind}/`)).json()) as { id: number; name: string }[];
  const [languages, seasons, placements, genres, tags] = await Promise.all(
    ['languages', 'liturgical-seasons', 'mass-placements', 'genres', 'tags'].map(categories),
  );
  const season = seasons.find((row) => row.name === 'Holy Cross')!;
  const other = seasons.find((row) => row.name === 'Advent')!;
  const placement = placements.find((row) => row.name === 'Communion')!;
  const prefix = `Picker controls review ${suffix}-${info.project.name}`;
  const titles = ['A neutral', 'B matching', 'C different', 'D neutral'].map(
    (name) => `${prefix} ${name}`,
  );
  for (const [index, title] of titles.entries()) {
    const response = await page.request.post('/api/v1/hymns/', {
      headers,
      data: {
        title,
        language_id: languages[0].id,
        placement_ids: [placement.id],
        is_season_neutral: index === 0 || index === 3,
        season_ids: [index === 1 ? season.id : other.id],
        genre_ids: [genres[0].id],
        tag_ids: [tags[0].id],
        estimated_duration_minutes: ['9', '2', '1', '10'][index],
        default_key: 'D',
        is_polyphonic: true,
        voices: ['Soprano', 'Alto'],
      },
    });
    expect(response.status()).toBe(201);
  }
  const created = await page.request.post('/api/v1/masses/', {
    headers,
    data: { date: '2026-10-25', title: prefix, liturgical_season_id: season.id },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).id as number;
  await page.goto(`/masses/${id}/edit`);
  const section = page.getByRole('region', { name: 'Communion', exact: true });
  const open = async () => {
    await page.getByRole('button', { name: 'Add hymn to Communion', exact: true }).click();
    const picker = page.locator('.inline-hymn-picker');
    const response = page.waitForResponse(
      (row) =>
        row.url().includes('/api/v1/hymns/') &&
        new URL(row.url()).searchParams.get('q') === prefix &&
        row.ok(),
    );
    await picker.getByLabel('Search hymns').fill(prefix);
    await response;
    await expect(picker.locator('.picker-result-row')).toHaveCount(4);
    return picker;
  };
  let picker = await open();
  const search = picker.getByLabel('Search hymns');
  const filters = picker.getByRole('button', { name: 'Filters', exact: true });
  const inputBox = (await search.boundingBox())!;
  const filterBox = (await filters.boundingBox())!;
  expect(Math.abs(inputBox.y - filterBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(inputBox.height - filterBox.height)).toBeLessThanOrEqual(1);
  expect(await search.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('none');
  await filters.click();
  const boxes = await Promise.all(
    ['Language filter', 'Genre filter', 'Sort hymns'].map((name) =>
      picker.getByLabel(name).boundingBox(),
    ),
  );
  expect(
    Math.max(...boxes.map((box) => box!.y)) - Math.min(...boxes.map((box) => box!.y)),
  ).toBeLessThanOrEqual(1);
  const order = async (ordering: string) => {
    const response = page.waitForResponse(
      (row) =>
        row.url().includes('/api/v1/hymns/') &&
        new URL(row.url()).searchParams.get('ordering') === ordering &&
        row.ok(),
    );
    if (info.project.name === 'desktop')
      await picker.getByRole('button', { name: 'Sort by Minutes' }).click();
    else await picker.getByLabel('Sort hymns').selectOption(ordering);
    await response;
  };
  await order('duration');
  await expect(picker.locator('.picker-result-row').first()).toContainText(titles[1]);
  await expect(picker.locator('.picker-result-row').last()).toContainText(titles[2]);
  await order('-duration');
  await expect(picker.locator('.picker-result-row').first()).toContainText(titles[3]);
  if (info.project.name === 'desktop') {
    await expect(picker.getByRole('columnheader')).toHaveCount(9);
    expect(
      await picker
        .locator('.picker-table')
        .evaluate((node) => parseFloat(getComputedStyle(node).minWidth)),
    ).toBe(728);
    expect(
      (await picker.getByRole('columnheader', { name: 'Language', exact: false }).boundingBox())!
        .width,
    ).toBeLessThanOrEqual(74);
    expect(
      await picker
        .locator('.picker-table-scroll')
        .evaluate((node) => node.scrollHeight - node.clientHeight),
    ).toBeLessThanOrEqual(1);

    await picker.locator('.picker-table-scroll').evaluate((node) => {
      node.scrollLeft = 900;
    });
    await expect(picker.getByText(titles[3], { exact: true })).toBeInViewport();
  } else await expect(picker.getByRole('table')).toHaveCount(0);
  await picker.screenshot({ path: info.outputPath('picker-controls.png') });
  await picker.getByRole('button', { name: `Choose ${titles[0]}`, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Selection warnings' })).toHaveCount(0);
  await expect(page.locator('.save-status')).toHaveText('Saved');
  await expect(section.getByRole('button', { name: /^Reorder / })).toHaveCount(0);
  const edit = (await section
    .getByRole('button', { name: `Edit ${titles[0]}`, exact: true })
    .boundingBox())!;
  const remove = (await section
    .getByRole('button', { name: `Remove ${titles[0]}`, exact: true })
    .boundingBox())!;
  expect(edit.width).toBe(40);
  expect(edit.height).toBe(40);
  expect(remove.y).toBe(edit.y);
  expect(remove.x).toBeGreaterThanOrEqual(edit.x + edit.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const index of [1, 3, 2]) {
    picker = await open();
    await picker.getByRole('button', { name: `Choose ${titles[index]}`, exact: true }).click();
    if (index === 2) {
      await expect(picker.getByRole('region', { name: 'Selection warnings' })).toContainText(
        'Classified for Advent; this Mass is Holy Cross.',
      );
      await picker.getByRole('button', { name: 'Add anyway' }).click();
    }
    await expect(page.locator('.save-status')).toHaveText('Saved');
    await expect(section.getByRole('button', { name: /^Reorder / })).toHaveCount(
      index === 1 ? 2 : index === 3 ? 3 : 4,
    );
  }
  const warnings = page.getByRole('region', { name: 'Program warnings' });
  await expect(warnings).toContainText(titles[2]);
  await expect(warnings).not.toContainText(titles[0]);
  await expect(warnings).not.toContainText(titles[3]);
  await page.getByRole('button', { name: `Edit ${titles[0]}`, exact: true }).click();
  await page
    .getByLabel(`Selection notes for ${titles[0]}`)
    .fill('Keep this choir note after dragging');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('Saved');
  const before = (await (await page.request.get(`/api/v1/masses/${id}/`)).json()).program as {
    id: number;
    hymn: { title: string };
    notes: string;
  }[];
  const source = page.getByRole('button', { name: `Reorder ${titles[3]}`, exact: true });
  expect(await source.evaluate((node) => getComputedStyle(node).borderTopWidth)).toBe('0px');
  expect(await source.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
    'rgba(0, 0, 0, 0)',
  );
  await source.scrollIntoViewIfNeeded();
  await section.locator('.program-row').first().scrollIntoViewIfNeeded();
  const from = (await source.boundingBox())!;
  const to = (await section.locator('.program-row').first().boundingBox())!;
  const x = from.x + from.width / 2,
    startY = from.y + from.height / 2,
    endY = to.y + 8;
  // Preview must not save; cancelled pointers/keyboard gestures leave stored order intact.
  const storedTitles = before.map((row) => row.hymn.title);
  if (info.project.name === 'desktop') {
    await page.mouse.move(x, startY);
    await page.mouse.down();
    await page.mouse.move(x, endY, { steps: 14 });
    await expect(section.locator('.program-row').first()).toContainText(titles[3]);
    await source.press('Escape');
    await page.mouse.up();
    await expect(section.locator('.program-row').first()).toContainText(titles[0]);
    expect(
      (await (await page.request.get(`/api/v1/masses/${id}/`)).json()).program.map(
        (row: { hymn: { title: string } }) => row.hymn.title,
      ),
    ).toEqual(storedTitles);
    await page.mouse.move(x, startY);
    await page.mouse.down();
    await page.mouse.move(x, endY, { steps: 14 });
    await page.mouse.up();
  } else {
    const touch = await page.context().newCDPSession(page);
    const drag = async () => {
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y: startY }],
      });
      for (let step = 1; step <= 12; step++)
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: startY + ((endY - startY) * step) / 12 }],
        });
    };
    await drag();
    await expect(section.locator('.program-row').first()).toContainText(titles[3]);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(section.locator('.program-row').first()).toContainText(titles[0]);
    expect(
      (await (await page.request.get(`/api/v1/masses/${id}/`)).json()).program.map(
        (row: { hymn: { title: string } }) => row.hymn.title,
      ),
    ).toEqual(storedTitles);
    await drag();
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.detach();
  }
  await expect(section.locator('.program-row').first()).toContainText(titles[3]);
  await expect(page.locator('.save-status')).toHaveText('Saved');
  const after = (await (await page.request.get(`/api/v1/masses/${id}/`)).json())
    .program as typeof before;
  expect(after.map((row) => row.hymn.title)).toEqual([titles[3], titles[0], titles[1], titles[2]]);
  expect(after.map((row) => row.id).sort()).toEqual(before.map((row) => row.id).sort());
  expect(after.find((row) => row.hymn.title === titles[0])!.notes).toBe(
    'Keep this choir note after dragging',
  );
  await page.reload();
  await expect(section.locator('.program-row').first()).toContainText(titles[3]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('dragged-program.png'), fullPage: true });
});
