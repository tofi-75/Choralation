import { initialChoirId, selectInitialChoir } from './choir-context';
/** Real sessions, private PDF canvas, saved reading order, and compact responsive layout. */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
const suffix = process.env.E2E_USER_SUFFIX;
const password = process.env.E2E_PASSWORD;
if (!suffix || !password) throw new Error('Run through scripts/e2e.ps1.');
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(`e2e-${suffix}-planner`);
  await page.getByLabel('Password', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
  await selectInitialChoir(page);
}
async function choose(page: Page, group: string, value: string) {
  const field = page.getByRole('group', { name: group, exact: true });
  await field.getByRole('button', { name: /^Choose / }).click();
  await field.getByRole('checkbox', { name: value, exact: true }).check();
}

async function checkPdfZoom(viewer: Locator) {
  const viewport = viewer.locator('.pdf-viewport');
  const canvas = viewer.locator('canvas');
  await expect(viewport).toHaveAttribute('aria-busy', 'false');
  const fits = () =>
    viewport.evaluate((element) => {
      const page = element.querySelector('canvas')!.getBoundingClientRect();
      return page.height <= element.clientHeight + 1 && page.width <= element.clientWidth + 1;
    });
  await expect.poll(fits).toBe(true);
  const height = (await canvas.boundingBox())!.height;
  await viewer.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(viewer.getByLabel('Zoom relative to fit')).toHaveText('125%');
  await expect.poll(async () => (await canvas.boundingBox())!.height).toBeGreaterThan(height * 1.2);
  await expect(viewport).toHaveAttribute('aria-busy', 'false');
  // Zoom changes the actual canvas, rather than clipping/shrinking it back to the container.
  const pixels = await canvas.evaluate((element) => {
    const page = element as HTMLCanvasElement;
    return page.width * page.height;
  });
  expect(pixels).toBeLessThanOrEqual(8000000);
  await viewer.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(viewer.getByLabel('Zoom relative to fit')).toHaveText('100%');
  await viewer.getByRole('button', { name: 'Fit to width', exact: true }).click();
  await expect(viewer.getByRole('button', { name: 'Fit to height', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      viewport.evaluate((element) =>
        Math.abs(
          element.querySelector('canvas')!.getBoundingClientRect().width - element.clientWidth,
        ),
      ),
    )
    .toBeLessThan(2);
  await viewer.getByRole('button', { name: 'Fit to height', exact: true }).click();
  await expect.poll(fits).toBe(true);
}

async function checkFocusRotation(page: Page, focus: Locator) {
  const portrait = page.viewportSize()!;
  const rotation = await page.context().newCDPSession(page);
  const viewport = focus.locator('.pdf-viewport');
  const canvas = viewport.locator('canvas');
  const fitsPage = () =>
    viewport.evaluate((element) => {
      const page = element.querySelector('canvas')!.getBoundingClientRect();
      return page.width <= element.clientWidth + 1 && page.height <= element.clientHeight + 1;
    });
  const rotate = (landscape: boolean) =>
    rotation.send('Emulation.setDeviceMetricsOverride', {
      width: landscape ? portrait.height : portrait.width,
      height: landscape ? portrait.width : portrait.height,
      deviceScaleFactor: 1,
      mobile: true,
      screenOrientation: landscape
        ? { type: 'landscapePrimary', angle: 90 }
        : { type: 'portraitPrimary', angle: 0 },
    });

  try {
    await rotate(true);
    await expect(focus.getByRole('button', { name: 'Fit to height', exact: true })).toBeVisible();
    await expect
      .poll(() =>
        viewport.evaluate((element) =>
          Math.abs(
            element.querySelector('canvas')!.getBoundingClientRect().width - element.clientWidth,
          ),
        ),
      )
      .toBeLessThan(2);
    await rotate(false);
    await expect(focus.getByRole('button', { name: 'Fit to width', exact: true })).toBeVisible();
    await expect.poll(fitsPage).toBe(true);

    const fitWidth = (await canvas.boundingBox())!.width;
    const portraitWidth = await viewport.evaluate((element) => element.clientWidth);
    await focus.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect
      .poll(async () => (await canvas.boundingBox())!.width)
      .toBeGreaterThan(fitWidth * 1.2);
    const zoomed = (await canvas.boundingBox())!;
    await rotate(true);
    await expect
      .poll(() => viewport.evaluate((element) => element.clientWidth))
      .toBeGreaterThan(portraitWidth);
    await expect(focus.getByRole('button', { name: 'Fit to width', exact: true })).toBeVisible();
    await expect(focus.getByLabel('Zoom relative to fit')).toHaveText('125%');
    expect((await canvas.boundingBox())!.width).toBeCloseTo(zoomed.width, 0);
    expect((await canvas.boundingBox())!.height).toBeCloseTo(zoomed.height, 0);
    await rotate(false);
    await expect
      .poll(() => viewport.evaluate((element) => element.clientWidth))
      .toBe(portraitWidth);
    expect((await canvas.boundingBox())!.width).toBeCloseTo(zoomed.width, 0);
    await focus.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await expect.poll(fitsPage).toBe(true);
  } finally {
    await rotate(false);
    await rotation.detach();
  }
}

async function swipe(
  page: Page,
  surface: Locator,
  direction: 'left' | 'right' | 'down' | 'up' | 'long-down' | 'diagonal' | 'two-finger',
) {
  const box = (await surface.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const horizontal = direction === 'left' || direction === 'right';
  const long = direction === 'long-down';
  const startX = box.x + box.width * (direction === 'left' ? 0.82 : horizontal ? 0.18 : 0.5);
  const startY = box.y + box.height * (long ? 0.12 : direction === 'up' ? 0.68 : 0.29);
  const dx = horizontal
    ? box.width * (direction === 'left' ? -0.64 : 0.64)
    : direction === 'diagonal'
      ? 75
      : 0;
  const dy = horizontal
    ? 0
    : long
      ? Math.min(340, box.height * 0.8)
      : direction === 'up'
        ? -76
        : 76;
  const point = (step: number) => ({ id: 1, x: startX + dx * step, y: startY + dy * step });
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(0)] });
    const secondFinger = (step: number) => ({ ...point(step), id: 2, x: point(step).x + 25 });
    if (direction === 'two-finger') {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [point(0), secondFinger(0)],
      });
    }
    for (const step of [0.25, 0.5, 0.75, 1]) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: direction === 'two-finger' ? [point(step), secondFinger(step)] : [point(step)],
      });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await session.detach();
  }
}

async function swipePdf(page: Page, viewer: Locator, direction: Parameters<typeof swipe>[2]) {
  const viewport = viewer.locator('.pdf-viewport');
  await expect(viewport).toHaveAttribute('aria-busy', 'false');
  await swipe(page, viewport, direction);
}

async function checkSideButtons(viewer: Locator) {
  const previous = (await viewer
    .getByRole('button', { name: 'Previous PDF page', exact: true })
    .boundingBox())!;
  const next = (await viewer
    .getByRole('button', { name: 'Next PDF page', exact: true })
    .boundingBox())!;
  const viewport = (await viewer.locator('.pdf-viewport').boundingBox())!;
  expect(previous.x).toBeGreaterThanOrEqual(viewport.x);
  expect(previous.x + previous.width).toBeLessThan(viewport.x + viewport.width / 3);
  expect(next.x + next.width).toBeLessThanOrEqual(viewport.x + viewport.width);
  expect(next.x).toBeGreaterThan(viewport.x + (viewport.width * 2) / 3);
  expect(
    Math.abs(previous.y + previous.height / 2 - viewport.y - viewport.height / 2),
  ).toBeLessThan(2);
}

async function saveReadingProgram(
  page: Page,
  headers: Record<string, string>,
  title: string,
  season: number,
  placement: number,
  hymns: { id: number; notes?: string }[],
) {
  const massResponse = await page.request.post('/api/v1/masses/', {
    headers,
    data: {
      date: '2099-10-11',
      title,
      liturgical_season_id: season,
      notes: null,
    },
  });
  expect(massResponse.status()).toBe(201);
  const mass = await massResponse.json();
  const program = await page.request.put(`/api/v1/masses/${mass.id}/program/`, {
    headers: { ...headers, 'X-Expected-Mass-Revision': String(mass.revision) },
    data: {
      selections: hymns.map((hymn, position) => ({
        hymn_id: hymn.id,
        placement_id: placement,
        position,
        notes: hymn.notes ?? null,
      })),
    },
  });
  expect(program.status()).toBe(200);
  const finalized = await page.request.post(`/api/v1/masses/${mass.id}/finalize/`, {
    headers: { ...headers, 'X-Expected-Mass-Revision': String((await program.json()).revision) },
    data: {},
  });
  expect(finalized.status()).toBe(200);
  return mass.id as number;
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
  const lyrics = Array.from(
    { length: 36 },
    (_, index) => `السطر الأول ${index + 1} — Choir 👩🏽‍🎤\nالسطر الثاني e\u0301 Hallelujah`,
  ).join('\n');
  await page.goto('/hymns/new');
  await page.getByRole('textbox', { name: /^Title/ }).fill(title);
  await page.getByRole('combobox', { name: /^Language/ }).selectOption({ label: 'Arabic' });
  await page.getByRole('textbox', { name: 'Latin Characters Name', exact: true }).fill(latin);
  await page.getByRole('textbox', { name: 'Lyrics', exact: true }).fill(lyrics);
  await page.getByRole('textbox', { name: 'Default key', exact: true }).fill('D minor');
  await page.getByRole('textbox', { name: 'Tempo', exact: true }).fill('Andante · 80 BPM');
  await choose(page, 'Suitable placements', 'Communion');
  await choose(page, 'Suitable seasons', 'Ordinary Time');
  await page.getByRole('button', { name: 'Save hymn', exact: true }).click();
  await page.getByRole('button', { name: 'Close notification', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const lyricId = Number(page.url().split('/').pop());
  await expect(page.locator('.hymn-lyrics')).toHaveText(lyrics);
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
    'X-Choir-ID': await initialChoirId(page),
    'X-CSRFToken': (await (await page.request.get('/api/v1/auth/csrf/')).json())
      .csrf_token as string,
  };
  const lyric = await (
    await page.request.get(`/api/v1/hymns/${lyricId}/`, {
      headers: { 'X-Choir-ID': await initialChoirId(page) },
    })
  ).json();
  const fallbackLyrics = Array.from(
    { length: 36 },
    (_, index) => `PDF fallback lyrics ${index + 1}\nSing the refrain`,
  ).join('\n');
  const payload = {
    title: `PDF ${suffix}-${info.project.name}`,
    language_id: lyric.language.id,
    placement_ids: [lyric.placements[0].id],
    season_ids: [lyric.seasons[0].id],
    lyrics: fallbackLyrics,
    default_key: 'G minor',
    tempo: '96 BPM',
    is_polyphonic: true,
    voices: ['Soprano', 'Alto'],
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
  const longTitleDirection = info.project.use.isMobile ? 'rtl' : 'ltr';
  const longTitle =
    longTitleDirection === 'rtl'
      ? `ترنيمة ${suffix}-${info.project.name} ${'عنوان طويل باللغة العربية للاختبار '.repeat(9)}`
      : `Hymn ${suffix}-${info.project.name} ${'A long title for the choir to sing together '.repeat(9)}`;
  const plainResponse = await page.request.post('/api/v1/hymns/', {
    headers,
    data: {
      ...payload,
      title: longTitle.slice(0, 255).trimEnd(),
      lyrics: null,
      default_key: null,
      tempo: null,
      voices: [],
    },
  });
  expect(plainResponse.status()).toBe(201);
  const plain = await plainResponse.json();
  await page.goto(`/hymns/${pdf.id}`);
  await expect(page.getByRole('link', { name: '← Hymn library', exact: true })).toHaveAttribute(
    'href',
    '/hymns',
  );
  await expect(page.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
  await expect(page.getByText('Loading sheet music…', { exact: true })).toHaveCount(0);
  expect(
    await page
      .locator('.pdf-sheet canvas')
      .evaluate((canvas) => (canvas as HTMLCanvasElement).height),
  ).toBeGreaterThan(0);
  await checkPdfZoom(page.locator('.pdf-sheet'));
  await expect(page.getByText(fallbackLyrics, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next PDF page', exact: true }).click();
  await expect(page.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
  await page.getByRole('button', { name: `Open ${pdf.title} PDF fullscreen`, exact: true }).click();
  const fullscreen = page.getByRole('dialog', { name: `${pdf.title} · PDF`, exact: true });
  await expect(fullscreen).toBeVisible();
  await expect(fullscreen.getByText('Loading sheet music…', { exact: true })).toHaveCount(0);
  await expect(fullscreen.locator('canvas')).toHaveAttribute('style', /width:/);
  await expect(fullscreen.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
  await checkPdfZoom(fullscreen);
  await checkSideButtons(fullscreen);
  const fullArea = (await fullscreen.locator('.pdf-viewport').boundingBox())!;
  const fullBounds = (await fullscreen.boundingBox())!;
  expect(fullArea.height).toBeGreaterThan(fullBounds.height * 0.98);
  expect(fullArea.width).toBeGreaterThan(fullBounds.width * 0.98);
  await expect(fullscreen).toHaveAttribute('data-controls-visible', 'false', { timeout: 5000 });
  await fullscreen
    .locator('.pdf-viewport')
    .click({ position: { x: fullArea.width / 2, y: fullArea.height / 3 } });
  await expect(fullscreen).toHaveAttribute('data-controls-visible', 'true');

  await expect(
    fullscreen.getByRole('button', { name: 'Next PDF page', exact: true }),
  ).toBeDisabled();
  await fullscreen.getByRole('button', { name: 'Previous PDF page', exact: true }).click();
  await expect(fullscreen.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
  await expect(
    fullscreen.getByRole('button', { name: 'Previous PDF page', exact: true }),
  ).toBeDisabled();
  const readingArea = fullscreen.locator('.pdf-viewport');
  const clickSide = async (fraction: number) => {
    const area = (await readingArea.boundingBox())!;
    await readingArea.click({ position: { x: area.width * fraction, y: area.height / 2 } });
  };
  await clickSide(0.85);
  await expect(fullscreen.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
  await clickSide(0.15);
  await expect(fullscreen.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
  if (info.project.name.startsWith('mobile')) {
    await swipePdf(page, fullscreen, 'left');
    await expect(fullscreen.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
    await swipePdf(page, fullscreen, 'right');
    await expect(fullscreen.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
    await swipePdf(page, fullscreen, 'down');
    await expect(fullscreen.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
    await swipePdf(page, fullscreen, 'up');
    await expect(fullscreen.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
    await swipePdf(page, fullscreen, 'diagonal');
    await swipePdf(page, fullscreen, 'two-finger');
    await expect(fullscreen.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
    await swipePdf(page, fullscreen, 'up');
    await expect(fullscreen.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
    await swipePdf(page, fullscreen, 'down');
    await expect(fullscreen.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
    await fullscreen.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(fullscreen.getByLabel('Zoom relative to fit')).toHaveText('125%');
    await expect(readingArea).toHaveAttribute('aria-busy', 'false');
    await swipePdf(page, fullscreen, 'left');
    await expect(fullscreen.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
    for (let step = 0; step < 2; step++)
      await fullscreen.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect
      .poll(() => readingArea.evaluate((element) => element.scrollHeight - element.clientHeight))
      .toBeGreaterThan(75);
    await readingArea.evaluate((element) => {
      element.scrollTop = 75;
    });
    await swipePdf(page, fullscreen, 'long-down');
    await expect(fullscreen).toBeVisible();
    await expect(fullscreen.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
    const room = () =>
      readingArea.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
      );
    const initialRoom = await room();
    await swipePdf(page, fullscreen, 'up');
    await expect(fullscreen.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
    await expect.poll(room).toBeLessThan(initialRoom);
    // Let native momentum finish before positioning the viewport for a new gesture.
    await readingArea.evaluate(
      (element) =>
        new Promise<void>((resolve) => {
          let timer: number;
          const waitForQuiet = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
              element.removeEventListener('scroll', waitForQuiet);
              resolve();
            }, 180);
          };
          element.addEventListener('scroll', waitForQuiet);
          waitForQuiet();
        }),
    );
    await readingArea.evaluate((element) =>
      element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }),
    );
    await expect.poll(room).toBeLessThan(2);
    await expect(fullscreen.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
    await swipePdf(page, fullscreen, 'up');
    await expect(fullscreen.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
    await fullscreen.getByRole('button', { name: 'Previous PDF page', exact: true }).click();
    await expect(fullscreen.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
    for (let step = 0; step < 3; step++)
      await fullscreen.getByRole('button', { name: 'Zoom out', exact: true }).click();
  }
  await fullscreen.getByRole('button', { name: 'Next PDF page', exact: true }).click();
  await expect(fullscreen.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
  const originalSize = page.viewportSize()!;
  // Emulate rotation without resizing the native fullscreen window (Linux disallows that).
  const rotation = await page.context().newCDPSession(page);
  const mobile = info.project.use.isMobile ?? false;
  await rotation.send('Emulation.setDeviceMetricsOverride', {
    width: 844,
    height: 390,
    deviceScaleFactor: 1,
    mobile,
    screenOrientation: { type: 'landscapePrimary', angle: 90 },
  });
  await expect
    .poll(() =>
      fullscreen
        .locator('.pdf-viewport')
        .evaluate(
          (element) =>
            element.querySelector('canvas')!.getBoundingClientRect().height <=
            element.clientHeight + 1,
        ),
    )
    .toBe(true);
  await rotation.send('Emulation.setDeviceMetricsOverride', {
    ...originalSize,
    deviceScaleFactor: 1,
    mobile,
    screenOrientation:
      originalSize.width < originalSize.height
        ? { type: 'portraitPrimary', angle: 0 }
        : { type: 'landscapePrimary', angle: 90 },
  });
  await rotation.detach();
  if (await page.evaluate(() => document.fullscreenEnabled))
    await expect
      .poll(() =>
        page.evaluate(() => document.fullscreenElement?.classList.contains('pdf-fullscreen')),
      )
      .toBe(true);
  if (mobile) await swipePdf(page, fullscreen, 'long-down');
  else await fullscreen.getByRole('button', { name: 'Exit PDF fullscreen', exact: true }).click();
  await expect(fullscreen).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: `Open ${pdf.title} PDF fullscreen`, exact: true }),
  ).toBeFocused();
  await expect(page.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
  await page.getByRole('link', { name: 'Edit hymn', exact: true }).click();
  await page
    .getByLabel('Replace sheet music PDF', { exact: true })
    .setInputFiles('tests/fixtures/two-page-sheet-music.pdf');
  await expect(
    page.locator('.pdf-edit-preview').getByRole('img', { name: /sheet music page 1/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save hymn', exact: true }).click();
  await expect(page.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const massTitle = `Reading ${suffix}-${info.project.name}`;
  const massId = await saveReadingProgram(
    page,
    headers,
    massTitle,
    payload.season_ids[0],
    payload.placement_ids[0],
    [pdf, { ...lyric, notes: 'Start the refrain together.' }, plain, pdf],
  );
  const secondMassId = await saveReadingProgram(
    page,
    headers,
    `Second ${massTitle}`,
    payload.season_ids[0],
    payload.placement_ids[0],
    [pdf],
  );
  await page.goto(`/masses/${secondMassId}`);
  const pdfLink = page.getByRole('link', { name: pdf.title, exact: true }).first();
  await pdfLink.click();
  const back = page.getByRole('link', { name: '← Back to Mass', exact: true });
  await expect(back).toHaveAttribute('href', `/masses/${secondMassId}`);
  await back.click();
  await expect(
    page.getByRole('heading', { name: `Second ${massTitle}`, exact: true }),
  ).toBeVisible();
  await page.goto(`/masses/${massId}`);
  expect(
    await page.locator('.saved-program').evaluate((element) => getComputedStyle(element).textAlign),
  ).toBe('center');
  const savedProgram = page.getByRole('region', { name: 'Saved hymn program' });
  const metadata = savedProgram.locator('.hymn-musical-summary');
  await expect(metadata.nth(0).locator(':scope > *')).toHaveText([
    lyric.language.name,
    'Key G minor',
    'Tempo 96 BPM',
    'Voices 2',
  ]);
  await expect(metadata.nth(1)).toContainText('Voices 1');
  await expect(metadata.nth(2).locator('strong')).toHaveText(['—', '—', '-']);
  await expect(metadata.nth(0)).toHaveCSS('flex-wrap', 'wrap');
  await pdfLink.locator('.hymn-musical-summary').getByText('96 BPM').click();
  await expect(back).toHaveAttribute('href', `/masses/${massId}`);
  await back.click();
  await expect(page.getByRole('heading', { name: massTitle, exact: true })).toBeVisible();

  const plainUrl = `**/api/v1/hymns/${plain.id}/`;
  await page.route(plainUrl, (route) => route.fulfill({ status: 404 }));
  await savedProgram.getByRole('link', { name: plain.title, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unable to open hymn' })).toBeVisible();
  await back.click();
  await expect(page.getByRole('heading', { name: massTitle, exact: true })).toBeVisible();
  await page.unroute(plainUrl);

  await page.getByRole('button', { name: 'Focus mode', exact: true }).click();
  const focus = page.getByRole('dialog', { name: 'Focus mode', exact: true });
  const nativeFocus = await page.evaluate(
    () => document.fullscreenEnabled && matchMedia('(any-pointer: coarse)').matches,
  );
  if (nativeFocus)
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement?.className))
      .toBe('mass-focus');
  const focusHeader = focus.locator('.focus-header');
  await expect(focusHeader.getByRole('button', { name: 'Exit focus mode' })).toBeVisible();
  const jump = focusHeader.getByRole('combobox', { name: 'Jump to hymn', exact: true });
  await expect(jump).toHaveValue('0');
  await expect(focus).toBeFocused();
  await expect(jump).not.toBeFocused();
  await expect(focusHeader.locator('.focus-hymn-picker')).toHaveCSS('outline-style', 'none');
  await page.keyboard.press('Tab');
  await expect(jump).toBeFocused();
  const focusTitle = focusHeader.locator('.focus-hymn-picker h2');
  const titleSize = await focusTitle.evaluate((element) => getComputedStyle(element).fontSize);
  const headingText = (await focusTitle.boundingBox())!;
  const caret = (await focusHeader.locator('.focus-hymn-picker svg').boundingBox())!;
  const headerBox = (await focusHeader.boundingBox())!;
  expect(
    Math.abs(headingText.x + headingText.width / 2 - headerBox.width / 2 - headerBox.x),
  ).toBeLessThan(1);
  expect(caret.x).toBeGreaterThan(headingText.x + headingText.width);
  const footer = (await focus.locator('.focus-footer').boundingBox())!;
  const dialogBox = (await focus.boundingBox())!;
  expect(footer.y + footer.height).toBeCloseTo(dialogBox.y + dialogBox.height, 0);
  await expect(focus.locator('.focus-footer select')).toHaveCount(0);
  await expect(focus.getByRole('heading', { name: pdf.title, exact: true })).toBeVisible();
  const focusMetadata = focusHeader.locator('.hymn-musical-summary');
  await expect(focusMetadata.locator(':scope > span')).toHaveText([
    'Key G minor',
    'Tempo 96 BPM',
    'Voices 2',
  ]);
  await expect(focusMetadata).toHaveCSS('flex-wrap', 'wrap');
  await expect(focus.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
  await expect(focus.getByText('Loading sheet music…', { exact: true })).toHaveCount(0);
  await expect(focus.getByText('Screen kept awake', { exact: true })).toHaveCount(0);
  await checkPdfZoom(focus);
  await checkSideButtons(focus);
  if (mobile) {
    await swipePdf(page, focus, 'up');
    await expect(focus.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
    await expect(fullscreen).toHaveCount(0);
    await swipePdf(page, focus, 'down');
    await expect(focus.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
  }
  await focus.getByRole('button', { name: 'Fit to width', exact: true }).click();
  await focus.getByRole('button', { name: 'Next PDF page', exact: true }).click();
  await expect(focus.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
  await expect(focus.getByText('Hymn 1 of 4', { exact: true })).toBeVisible();
  // Keyboard page navigation on the PDF must not bubble to hymn navigation.
  await page.keyboard.press('ArrowLeft');
  await expect(focus.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
  await expect(focus.getByText('Hymn 1 of 4', { exact: true })).toBeVisible();
  await focus
    .getByRole('button', { name: `Open ${pdf.title} PDF fullscreen`, exact: true })
    .click();
  await expect(fullscreen).toBeVisible();
  await expect(fullscreen.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
  await expect(fullscreen.locator('.pdf-viewport')).toHaveAttribute('aria-busy', 'false');
  if (mobile) await swipePdf(page, fullscreen, 'up');
  else await fullscreen.getByRole('button', { name: 'Next PDF page', exact: true }).click();
  await expect(fullscreen.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
  if (mobile) await swipePdf(page, fullscreen, 'long-down');
  else await fullscreen.getByRole('button', { name: 'Exit PDF fullscreen', exact: true }).click();
  await expect(fullscreen).toHaveCount(0);
  await expect(focus.getByText('Hymn 1 of 4', { exact: true })).toBeVisible();
  await expect(focus.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
  await focus.getByRole('button', { name: 'Previous PDF page', exact: true }).click();
  await expect(focus.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
  if (nativeFocus) {
    expect(await page.evaluate(() => document.fullscreenElement?.className)).toBe('mass-focus');
    if (mobile) await swipePdf(page, focus, 'long-down');
    else await focus.getByRole('button', { name: 'Exit focus mode', exact: true }).click();
    await expect(focus).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  }
  // Browsers without the Fullscreen API still get a full-viewport reading dialog.
  await page.evaluate(() => {
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: () => Promise.reject(new Error('Fullscreen disabled for test')),
    });
  });
  if (nativeFocus) {
    await page.getByRole('button', { name: 'Focus mode', exact: true }).click();
    await focus.getByRole('button', { name: 'Fit to width', exact: true }).click();
  }
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
  await expect(focus.getByText('Hymn 1 of 4', { exact: true })).toBeVisible();
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
  await expect(focus.getByText('Hymn 2 of 4', { exact: true })).toBeVisible();
  await expect(focus.locator('.hymn-lyrics:not(.lyric-measure)')).toContainText('السطر الأول');
  const zoomIn = focus.getByRole('button', { name: 'Zoom in lyrics', exact: true });
  const zoomOut = focus.getByRole('button', { name: 'Zoom out lyrics', exact: true });
  const lyricText = focus.locator('.hymn-lyrics:not(.lyric-measure)');
  const originalFont = await lyricText.evaluate((element) =>
    parseFloat(getComputedStyle(element).fontSize),
  );
  await expect(zoomOut).toBeDisabled();
  await expect(focus.locator('.lyric-panel')).toHaveCSS('direction', 'rtl');
  await zoomIn.click();
  await zoomIn.click();
  await expect(zoomIn).toBeDisabled();
  expect(
    await lyricText.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThan(originalFont);
  await expect(focusTitle).toHaveCSS('font-size', titleSize);
  const lyricSurface = focus.locator('.lyric-pages');
  const note = focus.getByText('Start the refrain together.', { exact: true });
  await expect(note).toBeVisible();
  const noteBox = (await note.boundingBox())!;
  expect((await lyricSurface.boundingBox())!.y).toBeGreaterThan(noteBox.y + noteBox.height);
  const lyricCount = focus.locator('.lyric-page-count');
  const previousLyric = focus.getByRole('button', { name: 'Previous lyrics page' });
  const nextLyric = focus.getByRole('button', { name: 'Next lyrics page' });
  const words = async () => (await lyricText.textContent())!;

  await expect(lyricCount).toHaveText(/^Page 1 \/ [2-9]|^Page 1 \/ \d{2,}/);
  if (mobile) {
    await swipe(page, lyricSurface, 'down');
    await expect(previousLyric).toBeDisabled();
    await swipe(page, lyricSurface, 'up');
    await expect(lyricCount).toHaveText(/^Page 2 \//);
    await swipe(page, lyricSurface, 'down');
    await expect(previousLyric).toBeDisabled();
  } else {
    await focus.evaluate((element) => element.focus());
    await page.keyboard.press('PageDown');
    await expect(lyricCount).toHaveText(/^Page 2 \//);
    await page.keyboard.press('ArrowUp');
    await expect(previousLyric).toBeDisabled();
  }
  const graphemeStarts = new Set(
    Array.from(new Intl.Segmenter().segment(lyrics), ({ index }) => index),
  );
  const total = Number((await lyricCount.textContent())!.split('/')[1]);
  let allLyrics = '';
  for (let index = 1; index <= total; index++) {
    expect(graphemeStarts.has(allLyrics.length)).toBe(true);
    await expect(lyricCount).toHaveText(`Page ${index} / ${total}`);
    allLyrics += await words();
    expect(await lyricSurface.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThan(2);
    if (index < total) await nextLyric.click();
  }
  expect(allLyrics).toBe(lyrics);
  await expect(nextLyric).toBeDisabled();
  if (mobile) await swipe(page, lyricSurface, 'up');
  await expect(nextLyric).toBeDisabled();
  await previousLyric.click();
  const savedLyrics = await words();
  expect(savedLyrics.trim().length).toBeGreaterThan(5);
  const passage = savedLyrics.slice(0, 8);
  await zoomOut.click();
  await expect(lyricText).toContainText(passage);
  await zoomIn.click();
  await expect(lyricText).toHaveText(savedLyrics);
  const lyricPortrait = page.viewportSize()!;
  await page.setViewportSize({ width: 844, height: 390 });
  await expect
    .poll(async () => Number((await lyricCount.textContent())!.split('/')[1]))
    .not.toBe(total);
  await expect(lyricText).toContainText(passage);
  await page.setViewportSize(lyricPortrait);
  await expect(lyricText).toHaveText(savedLyrics);
  await page.screenshot({ path: info.outputPath('focus-lyrics.png') });
  await focus.getByRole('button', { name: 'Next hymn', exact: true }).click();
  await expect(focus.locator('.focus-title-only')).toHaveText(plain.title);
  await expect(focusTitle).toHaveText(plain.title);
  await expect(focusTitle).toHaveCSS('font-size', titleSize);
  await expect(focusTitle).toHaveCSS('direction', longTitleDirection);
  await expect(focusTitle).toHaveCSS('white-space', 'nowrap');
  await expect(focusTitle).toHaveCSS('text-overflow', 'ellipsis');
  expect(await focusTitle.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
    true,
  );
  const longTitleBox = (await focusTitle.boundingBox())!;
  const longTitleChevron = (await focusHeader.locator('.focus-hymn-picker svg').boundingBox())!;
  expect(longTitleBox.x + longTitleBox.width).toBeLessThan(longTitleChevron.x);
  await page.screenshot({ path: info.outputPath('focus-long-title.png') });
  await expect(focusMetadata.locator('strong')).toHaveText(['—', '—', '-']);
  await focus.getByRole('button', { name: 'Next hymn', exact: true }).click();
  await expect(focus.getByText('Hymn 4 of 4', { exact: true })).toBeVisible();
  await expect(focus.getByRole('button', { name: 'Fit to height', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      focus
        .locator('.pdf-viewport')
        .evaluate((element) =>
          Math.abs(
            element.querySelector('canvas')!.getBoundingClientRect().width - element.clientWidth,
          ),
        ),
    )
    .toBeLessThan(2);
  await expect(focus.getByRole('button', { name: 'Next hymn', exact: true })).toBeDisabled();
  await jump.selectOption('0');
  await focus.getByRole('button', { name: 'Next PDF page', exact: true }).click();
  await expect(focus.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
  await jump.selectOption('3');
  await expect(focus.getByRole('img', { name: /sheet music page 1/ })).toBeVisible();
  await jump.selectOption('0');
  await expect(focus.getByRole('img', { name: /sheet music page 2/ })).toBeVisible();
  await jump.selectOption('1');
  await expect(lyricText).toHaveAttribute('data-text-size', 'extra-large');
  await expect(lyricText).toHaveText(savedLyrics);
  if (mobile) await swipe(page, lyricSurface, 'long-down');
  else await focus.getByRole('button', { name: 'Exit focus mode', exact: true }).click();
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
  await expect(lyricText).toContainText('PDF fallback lyrics 1');
  await expect(lyricCount).toHaveText(/^Page 1 \/ (?:[2-9]|\d{2,})$/);
  await nextLyric.click();
  await expect(lyricCount).toHaveText(/^Page 2 \//);
  await expect(focus.locator('.lyric-panel')).toHaveCSS('direction', 'ltr');
  await expect(focus.getByRole('button', { name: 'Zoom in lyrics' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(focus).toHaveCount(0);

  // Start again with the browser's normal fullscreen behavior before reloading Focus.
  await page.unroute(`**/api/v1/hymns/${pdf.id}/sheet-music/`);
  await page.reload();
  const launchFocus = page.getByRole('button', { name: 'Focus mode', exact: true });
  await launchFocus.click();
  await expect(focus).toBeVisible();
  if (nativeFocus)
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement?.className))
      .toBe('mass-focus');

  await page.reload();
  await expect(focus).toBeFocused();
  await expect(focus.getByRole('heading', { name: pdf.title, exact: true })).toBeVisible();
  await focus.getByRole('button', { name: 'Exit focus mode', exact: true }).click();
  await expect(launchFocus).toBeFocused();
  await page.reload();
  await expect(launchFocus).toBeVisible();
  await expect(focus).toHaveCount(0);
});

test('Phone Focus preserves PDF fit and exits on a long swipe after rotation', async ({
  page,
}, info) => {
  test.skip(!info.project.use.isMobile, 'This scenario uses phone orientation and touch.');
  test.setTimeout(60_000);
  await login(page);
  const headers = {
    'X-Choir-ID': await initialChoirId(page),
    'X-CSRFToken': (await (await page.request.get('/api/v1/auth/csrf/')).json())
      .csrf_token as string,
  };
  async function firstCategory(collection: string) {
    const response = await page.request.get(`/api/v1/${collection}/?is_active=all`, { headers });
    expect(response.ok()).toBe(true);
    const categories = await response.json();
    return categories[0].id as number;
  }
  const [language, placement, season] = await Promise.all(
    ['languages', 'mass-placements', 'liturgical-seasons'].map(firstCategory),
  );
  const title = `Rotation score ${info.project.name}`;
  const response = await page.request.post('/api/v1/hymns/', {
    headers,
    multipart: {
      data: JSON.stringify({
        title,
        language_id: language,
        placement_ids: [placement],
        season_ids: [season],
      }),
      sheet_music_pdf: {
        name: 'score.pdf',
        mimeType: 'application/pdf',
        buffer: readFileSync('tests/fixtures/two-page-sheet-music.pdf'),
      },
    },
  });
  expect(response.status()).toBe(201);
  const hymn = await response.json();
  const mass = await saveReadingProgram(page, headers, `Reading ${title}`, season, placement, [
    hymn,
  ]);
  await page.goto(`/masses/${mass}`);
  const launch = page.getByRole('button', { name: 'Focus mode', exact: true });
  await launch.click();
  const focus = page.getByRole('dialog', { name: 'Focus mode', exact: true });
  await expect(focus.locator('.pdf-viewport')).toHaveAttribute('aria-busy', 'false');
  await checkFocusRotation(page, focus);
  await swipePdf(page, focus, 'long-down');
  await expect(focus).toHaveCount(0);
  await expect(launch).toBeFocused();
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
  await page.setViewportSize({ width: 360, height: 764 });
  await page.goto('/masses/new');
  const date = page.locator('.mass-date-field');
  const season = page.getByRole('combobox', { name: 'Liturgical season' });
  await expect(date).toBeVisible();
  const dateBox = (await date.locator('input').boundingBox())!;
  const seasonBox = (await season.boundingBox())!;
  expect(Math.abs(dateBox.y - seasonBox.y)).toBeLessThan(2);
  expect(dateBox.width).toBeLessThan(170);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('compact-mass-date.png'), fullPage: true });
  await page.screenshot({ path: info.outputPath('mass-list.png'), fullPage: true });
});
