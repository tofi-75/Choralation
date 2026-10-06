/** Validated library contracts. Categories come from data, never numeric seed constants. */
import { z } from 'zod';

import { request } from './client';

export const categorySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  is_active: z.boolean(),
  display_order: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Category = z.infer<typeof categorySchema>;
export const categoryKinds = [
  ['genres', 'Genres'],
  ['liturgical-seasons', 'Seasons'],
  ['mass-placements', 'Placements'],
  ['languages', 'Languages'],
  ['tags', 'Tags'],
] as const;
export type CategoryKind = (typeof categoryKinds)[number][0];
export type Categories = Record<CategoryKind, Category[]>;

export const textFields = [
  ['alternate_title', 'Alternate title'],
  ['first_line', 'First line'],
  ['composer', 'Composer'],
  ['arranger', 'Arranger'],
  ['source_or_hymnal', 'Source / hymnal'],
  ['hymnal_number', 'Hymnal number'],
  ['default_key', 'Default key'],
  ['audio_url', 'Audio URL'],
  ['sheet_music_url', 'Sheet music URL'],
  ['notes', 'Notes'],
] as const;
export type TextField = (typeof textFields)[number][0];
const optionalText = z.string().nullable();
export const hymnSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  language: categorySchema,
  genres: z.array(categorySchema),
  seasons: z.array(categorySchema),
  placements: z.array(categorySchema),
  tags: z.array(categorySchema),
  alternate_title: optionalText,
  first_line: optionalText,
  composer: optionalText,
  arranger: optionalText,
  source_or_hymnal: optionalText,
  hymnal_number: optionalText,
  default_key: optionalText,
  audio_url: optionalText,
  sheet_music_url: optionalText,
  sheet_music_pdf: z.object({ name: z.string(), url: z.string() }).nullable(),
  is_polyphonic: z.boolean(),
  voices: z.array(z.string()),
  notes: optionalText,
  estimated_duration_minutes: optionalText,
  is_season_neutral: z.boolean(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.number().nullable(),
  updated_by: z.number().nullable(),
});
export type Hymn = z.infer<typeof hymnSchema>;
export type HymnInput = Record<TextField, string | null> & {
  title: string;
  language_id: number;
  genre_ids: number[];
  season_ids: number[];
  placement_ids: number[];
  tag_ids: number[];
  is_season_neutral: boolean;
  estimated_duration_minutes: string | null;
  is_polyphonic: boolean;
  voices: string[];
  remove_sheet_music_pdf?: boolean;
};
export const pageSchema = z.object({
  count: z.number().int(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(hymnSchema),
});

/** Fetch all classification choices, including retained inactive links and filter labels. */
export async function fetchCategories(): Promise<Categories> {
  const entries = await Promise.all(
    categoryKinds.map(
      async ([kind]) =>
        [kind, await request(`/${kind}/?is_active=all`, z.array(categorySchema))] as const,
    ),
  );
  return Object.fromEntries(entries) as Categories;
}
export function fetchHymns(query: string) {
  return request(`/hymns/${query ? `?${query}` : ''}`, pageSchema);
}
export function fetchHymn(id: string) {
  return request(`/hymns/${id}/`, hymnSchema);
}
/** Save metadata and an optional PDF in one request, preserving the form on failure. */
export function saveHymn(input: HymnInput, id?: number, pdf?: File | null) {
  let body: string | FormData = JSON.stringify(input);
  if (pdf) {
    const multipart = new FormData();
    multipart.append('data', body);
    multipart.append('sheet_music_pdf', pdf);
    body = multipart;
  }
  return request(id ? `/hymns/${id}/` : '/hymns/', hymnSchema, {
    method: id ? 'PATCH' : 'POST',
    body,
  });
}
export function setHymnActive(id: number, active: boolean) {
  return request(`/hymns/${id}/`, hymnSchema, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: active }),
  });
}
export function deleteHymn(id: number) {
  return request(`/hymns/${id}/`, z.undefined(), { method: 'DELETE' });
}
