/** Real sessions, private PDF canvas, saved reading order, and compact responsive layout. */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
const suffix = process.env.E2E_USER_SUFFIX;
const password = process.env.E2E_PASSWORD;
if (!suffix || !password) throw new Error('Run through scripts/e2e.ps1.');
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(`e2e-${suffix}-planner`);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
}
async function choose(page: Page, group: string, value: string) {
  const field = page.getByRole('group', { name: group, exact: true });
  await field.getByRole('button', { name: /^Choose / }).click();
  await field.getByRole('checkbox', { name: value, exact: true }).check();
}

test('Performance materials: multilingual form/search, PDF-first reading and focus PDF/lyrics/title navigation', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const counters = { requests: 0, releases: 0 };
    Object.assign(window, { performanceWake: counters });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          counters.requests++;
          const lock = Object.assign(new EventTarget(), {
            released: false,
            release: async () => {
              counters.releases++;
              lock.released = true;
              lock.dispatchEvent(new Event('release'));
            },
          });
          return lock;
        },
      },
    });
  });
  await login(page);
  const title = `ترنيمة ${suffix}-${info.project.name}`;
  const latin = `Tarnima ${suffix}-${info.project.name}`;
  await page.goto('/hymns/new');
  await page.getByRole('textbox', { name: /^Title/ }).fill(title);
  await page.getByRole('combobox', { name: /^Language/ }).selectOption({ label: 'Arabic' });
  await page.getByRole('textbox', { name: 'Latin Characters Name', exact: true }).fill(latin);
  await page
    .getByRole('textbox', { name: 'Lyrics', exact: true })
    .fill('السطر الأول\nالسطر الثاني');
  await page.getByRole('textbox', { name: 'Default key', exact: true }).fill('D minor');
  await page.getByRole('textbox', { name: 'Tempo', exact: true }).fill('Andante · 80 BPM');
  await choose(page, 'Suitable placements', 'Communion');
  await choose(page, 'Suitable seasons', 'Ordinary Time');
  await page.getByRole('button', { name: 'Save hymn', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const lyricId = Number(page.url().split('/').pop());
  await expect(page.locator('.hymn-lyrics')).toHaveText('السطر الأول\nالسطر الثاني');
  await expect(page.locator('.hymn-musical-summary')).toContainText('D minor');
  await expect(page.locator('.hymn-musical-summary')).toContainText('Andante · 80 BPM');
  await expect(
    page.getByRole('link', { name: 'Edit hymn', exact: true }).locator('svg'),
  ).toBeVisible();
  const materialBounds = (await page.locator('.hymn-material').boundingBox())!;
  const metadataBounds = (await page.locator('#metadata-title').boundingBox())!;
  expect(materialBounds.y).toBeLessThan(metadataBounds.y);
  await page.screenshot({ path: info.outputPath('hymn-reading.png'), fullPage: true });
  await page.reload();
  await expect(page.locator('.hymn-lyrics')).toContainText('السطر الأول');
  await page.goto(`/hymns?q=${encodeURIComponent(latin)}`);
  await expect(
    page.getByRole('link', { name: title, exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const headers = {
    'X-CSRFToken': (await (await page.request.get('/api/v1/auth/csrf/')).json())
      .csrf_token as string,
  };
  const lyric = await (await page.request.get(`/api/v1/hymns/${lyricId}/`)).json();
  const payload = {
    title: `PDF ${suffix}-${info.project.name}`,
    language_id: lyric.language.id,
    placement_ids: [lyric.placements[0].id],
    season_ids: [lyric.seasons[0].id],
    lyrics: 'PDF fallback lyrics',
  };
  const pdfResponse = await page.request.post('/api/v1/hymns/', {
    headers,
    multipart: {
      data: JSON.stringify(payload),
      sheet_music_pdf: {
        name: 'score.pdf',
        mimeType: 'application/pdf',
        buffer: readFileSync('tests/fixtures/two-page-sheet-music.pdf'),
      },
    },
  });
  expect(pdfResponse.status()).toBe(201);
  const pdf = await pdfResponse.json();
  const plainResponse = await page.request.post('/api/v1/hymns/', {
    headers,
    data: { ...payload, title: `Title only ${suffix}-${info.project.name}`, lyrics: null },
  });
  expect(plainResponse.status()).toBe(201);
  const plain = await plainResponse.json();
  await page.goto(`/hymns/${pdf.id}`);
  await expect(page.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
  await expect(page.getByText('Loading sheet music…', { exact: true })).toHaveCount(0);
  expect(
    await page
      .locator('.pdf-sheet canvas')
      .evaluate((canvas) => (canvas as HTMLCanvasElement).height),
  ).toBeGreaterThan(0);
  await expect(page.getByText('PDF fallback lyrics', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next PDF page', exact: true }).click();
  await expect(page.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
  await page.getByRole('button', { name: `Open ${pdf.title} PDF fullscreen`, exact: true }).click();
  const fullscreen = page.getByRole('dialog', { name: `${pdf.title} · PDF`, exact: true });
  await expect(fullscreen).toBeVisible();
  await expect(fullscreen.getByText('Loading sheet music…', { exact: true })).toHaveCount(0);
  await expect(fullscreen.locator('canvas')).toHaveAttribute('style', /width:/);
  await expect(fullscreen.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
  if (await page.evaluate(() => document.fullscreenEnabled))
    await expect
      .poll(() =>
        page.evaluate(() => document.fullscreenElement?.classList.contains('pdf-fullscreen')),
      )
      .toBe(true);
  await fullscreen.getByRole('button', { name: 'Exit PDF fullscreen', exact: true }).click();
  await expect(fullscreen).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: `Open ${pdf.title} PDF fullscreen`, exact: true }),
  ).toBeFocused();
  await expect(page.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
  const massResponse = await page.request.post('/api/v1/masses/', {
    headers,
    data: {
      date: '2099-10-11',
      title: `Reading ${suffix}-${info.project.name}`,
      liturgical_season_id: lyric.seasons[0].id,
      notes: null,
    },
  });
  expect(massResponse.status()).toBe(201);
  const mass = await massResponse.json();
  const program = await page.request.put(`/api/v1/masses/${mass.id}/program/`, {
    headers: { ...headers, 'X-Expected-Mass-Revision': String(mass.revision) },
    data: {
      selections: [pdf, lyric, plain].map((hymn, position) => ({
        hymn_id: hymn.id,
        placement_id: lyric.placements[0].id,
        position,
        notes: null,
      })),
    },
  });
  expect(program.status()).toBe(200);
  const finalized = await page.request.post(`/api/v1/masses/${mass.id}/finalize/`, {
    headers: { ...headers, 'X-Expected-Mass-Revision': String((await program.json()).revision) },
    data: {},
  });
  expect(finalized.status()).toBe(200);
  await page.goto(`/masses/${mass.id}`);
  expect(
    await page.locator('.saved-program').evaluate((element) => getComputedStyle(element).textAlign),
  ).toBe('center');
  await page.getByRole('button', { name: 'Focus mode', exact: true }).click();
  const focus = page.getByRole('dialog', { name: 'Focus mode', exact: true });
  await expect(focus.getByRole('heading', { name: pdf.title, exact: true })).toBeVisible();
  await expect(focus.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
  await expect(focus.getByText('Loading sheet music…', { exact: true })).toHaveCount(0);
  await expect(focus.getByText('Screen kept awake', { exact: true })).toBeVisible();
  await focus
    .getByRole('button', { name: `Open ${pdf.title} PDF fullscreen`, exact: true })
    .click();
  await expect(fullscreen).toBeVisible();
  await expect(fullscreen.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
  await fullscreen.getByRole('button', { name: 'Exit PDF fullscreen', exact: true }).click();
  await expect(fullscreen).toHaveCount(0);
  await expect(focus.getByText('Hymn 1 of 3', { exact: true })).toBeVisible();
  // Browsers without the Fullscreen API still get a full-viewport reading dialog.
  await page.evaluate(() => {
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: () => Promise.reject(new Error('Fullscreen disabled for test')),
    });
  });
  await focus
    .getByRole('button', { name: `Open ${pdf.title} PDF fullscreen`, exact: true })
    .click();
  await expect(fullscreen).toBeVisible();
  await expect(fullscreen.getByText('Loading sheet music…', { exact: true })).toHaveCount(0);
  await expect(fullscreen.locator('canvas')).toHaveAttribute('style', /width:/);
  expect(
    await fullscreen.locator('canvas').evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const color = canvas
        .getContext('2d')!
        .getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
      return color[0] > 80 && color[0] < 140 && color[1] < 60;
    }),
  ).toBe(true);
  const expandedBounds = (await fullscreen.boundingBox())!;
  expect(Math.round(expandedBounds.width)).toBe(page.viewportSize()!.width);
  expect(Math.round(expandedBounds.height)).toBe(page.viewportSize()!.height);
  await page.screenshot({ path: info.outputPath('pdf-fullscreen.png') });
  await page.keyboard.press('Escape');
  await expect(fullscreen).toHaveCount(0);
  await expect(focus.getByText('Hymn 1 of 3', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('focus-pdf.png') });
  if (info.project.name.startsWith('mobile')) {
    const box = (await focus.locator('.focus-reading').boundingBox())!;
    const session = await page.context().newCDPSession(page);
    const y = box.y + Math.min(box.height / 2, 180);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width * 0.85, y }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: box.x + box.width * 0.15, y }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else await page.keyboard.press('ArrowRight');
  await expect(focus.getByText('Hymn 2 of 3', { exact: true })).toBeVisible();
  await expect(focus.locator('.hymn-lyrics')).toContainText('السطر الأول');
  await page.screenshot({ path: info.outputPath('focus-lyrics.png') });
  await focus.getByRole('button', { name: 'Next hymn', exact: true }).click();
  await expect(focus.locator('.focus-title-only')).toHaveText(plain.title);
  await expect(focus.getByRole('button', { name: 'Next hymn', exact: true })).toBeDisabled();
  await focus.getByRole('button', { name: 'Exit focus mode', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Focus mode', exact: true })).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const counters = (
          window as unknown as { performanceWake: { requests: number; releases: number } }
        ).performanceWake;
        return counters.requests > 0 && counters.releases === counters.requests;
      }),
    )
    .toBe(true);
  await page.route(`**/api/v1/hymns/${pdf.id}/sheet-music/`, (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.getByRole('button', { name: 'Focus mode', exact: true }).click();
  await expect(focus.getByRole('alert')).toContainText('could not be displayed');
  await expect(focus.locator('.hymn-lyrics')).toHaveText('PDF fallback lyrics');
  await page.keyboard.press('Escape');
  await expect(focus).toHaveCount(0);
});

test('Home heading alignment and Mass actions stay on one line at narrow widths', async ({
  page,
}, info) => {
  await login(page);
  for (const width of [320, 478, 539, 844]) {
    await page.setViewportSize({ width, height: 764 });
    await page.goto('/dashboard');
    const heading = page.locator('.home-section .section-heading');
    await expect(heading).toBeVisible();
    await expect(page.getByText('Loading upcoming Masses…', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Loading new hymns…', { exact: true })).toHaveCount(0);
    // Read both rectangles atomically after async content has settled.
    if (width >= 478)
      expect(
        await heading.evaluate((element) => {
          const title = element.querySelector('h2')!.getBoundingClientRect();
          const actions = element.querySelector('.form-actions')!.getBoundingClientRect();
          return Math.abs(title.y + title.height / 2 - actions.y - actions.height / 2);
        }),
      ).toBeLessThan(2);
    await page.goto('/masses');
    const buttons = await page.locator('.mass-page-actions .button').all();
    const bounds = await Promise.all(buttons.map((button) => button.boundingBox()));
    for (const box of bounds) expect(Math.abs(box!.y - bounds[0]!.y)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.screenshot({ path: info.outputPath('mass-list.png'), fullPage: true });
});
