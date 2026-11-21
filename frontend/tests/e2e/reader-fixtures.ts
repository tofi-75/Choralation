import { browserOrigin } from '../test-server';
import { readFileSync } from 'node:fs';
import { expect, test as base } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import { initialChoirId } from './choir-context';

type Headers = Record<string, string>;
type Hymn = {
  id: number;
  title: string;
  language: { id: number; name: string };
  placements: { id: number }[];
  seasons: { id: number }[];
};
type Materials = {
  headers: Headers;
  lyric: Hymn;
  pdf: Hymn;
  plain: Hymn;
  lyrics: string;
  fallbackLyrics: string;
  longTitleDirection: string;
  payload: { season_ids: number[]; placement_ids: number[] };
};
type AuthState = Awaited<ReturnType<BrowserContext['storageState']>>;

// Reader-only account: UI auth/password tests cannot invalidate this cached session.
export const test = base.extend<{ materials: Materials }, { readerState: AuthState }>({
  readerState: [
    async ({ playwright }, use) => {
      const suffix = process.env.E2E_USER_SUFFIX;
      const password = process.env.E2E_PASSWORD;
      if (!suffix || !password) throw new Error('Use the isolated browser launcher.');
      const api = await playwright.request.newContext({ baseURL: browserOrigin });
      try {
        const token = await (await api.get('/api/v1/auth/csrf/')).json();
        const response = await api.post('/api/v1/auth/login/', {
          headers: { 'X-CSRFToken': token.csrf_token },
          data: { username: `e2e-${suffix}-reader`, password },
        });
        expect(response.status()).toBe(200);
        await use(await api.storageState());
      } finally {
        await api.dispose();
      }
    },
    { scope: 'worker' },
  ],
  storageState: async ({ readerState }, use) => {
    await use(readerState);
  },
  materials: async ({ page }, use, testInfo) => {
    const suffix = process.env.E2E_USER_SUFFIX!;
    const headers = {
      'X-Choir-ID': await initialChoirId(page),
      'X-CSRFToken': (await (await page.request.get('/api/v1/auth/csrf/')).json())
        .csrf_token as string,
    };
    async function category(collection: string, name: string) {
      const response = await page.request.get(`/api/v1/${collection}/?is_active=all`, { headers });
      expect(response.ok()).toBe(true);
      const rows = (await response.json()) as { id: number; name: string }[];
      const row = rows.find((item) => item.name === name);
      if (!row) throw new Error(`Missing fixture category ${collection}: ${name}`);
      return row.id;
    }
    const [language, placement, season] = await Promise.all([
      category('languages', 'Arabic'),
      category('mass-placements', 'Communion'),
      category('liturgical-seasons', 'Ordinary Time'),
    ]);
    const lyrics = Array.from(
      { length: 36 },
      (_, index) => `السطر الأول ${index + 1} — Choir 👩🏽‍🎤\nالسطر الثاني e\u0301 Hallelujah`,
    ).join('\n');
    const lyricResponse = await page.request.post('/api/v1/hymns/', {
      headers,
      data: {
        title: `ترنيمة ${suffix}-${testInfo.project.name}-${testInfo.testId.slice(-6)}`,
        language_id: language,
        placement_ids: [placement],
        season_ids: [season],
        lyrics,
        default_key: 'D minor',
        tempo: 'Andante · 80 BPM',
      },
    });
    expect(lyricResponse.status()).toBe(201);
    const lyric = (await lyricResponse.json()) as Hymn;
    const fallbackLyrics = Array.from(
      { length: 36 },
      (_, index) => `PDF fallback lyrics ${index + 1}\nSing the refrain`,
    ).join('\n');
    const payload = {
      title: `PDF ${suffix}-${testInfo.project.name}-${testInfo.testId.slice(-6)}`,
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
    const longTitleDirection = testInfo.project.use.isMobile ? 'rtl' : 'ltr';
    const longTitle =
      longTitleDirection === 'rtl'
        ? `ترنيمة ${suffix}-${testInfo.project.name}-${testInfo.testId.slice(-6)} ${'عنوان طويل باللغة العربية للاختبار '.repeat(9)}`
        : `Hymn ${suffix}-${testInfo.project.name}-${testInfo.testId.slice(-6)} ${'A long title for the choir to sing together '.repeat(9)}`;
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
    await use({ headers, lyric, pdf, plain, lyrics, fallbackLyrics, longTitleDirection, payload });
  },
});
