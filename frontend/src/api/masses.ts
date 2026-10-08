/** Revision-guarded draft contracts; all saved responses are validated. */
import { z } from 'zod';

import { request } from './client';
import { categorySchema, hymnSchema } from './library';

const warningSchema = z.object({
  code: z.string(),
  hymn_id: z.number(),
  selection_ids: z.array(z.number()),
  placement_id: z.number().optional(),
  facts: z.record(z.string(), z.unknown()),
});
const selectionSchema = z.object({
  id: z.number(),
  placement: categorySchema,
  hymn: hymnSchema,
  position: z.number(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
const summarySchema = z.object({
  id: z.number(),
  date: z.string(),
  title: z.string(),
  liturgical_season: categorySchema.nullable(),
  notes: z.string().nullable(),
  status: z.enum(['draft', 'finalized']),
  revision: z.number().int().positive(),
  selection_count: z.number(),
  created_by: z.number().nullable(),
  updated_by: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  finalized_at: z.string().nullable(),
});
export const massSchema = summarySchema.extend({
  program: z.array(selectionSchema),
  warnings: z.array(warningSchema),
});
export type Mass = z.infer<typeof massSchema>;
export type MassMetadata = {
  date: string;
  title: string | null;
  liturgical_season_id: number | null;
  notes: string | null;
};
export type SelectionInput = {
  id?: number;
  placement_id: number;
  hymn_id: number;
  position: number;
  notes: string | null;
};
const programSchema = z.object({
  mass_id: z.number(),
  revision: z.number(),
  selections: z.array(selectionSchema),
  warnings: z.array(warningSchema),
});
export type Program = z.infer<typeof programSchema>;

const randomPicksSchema = z.object({
  picks: z.array(z.object({ placement_id: z.number(), hymn: hymnSchema })),
  unfilled_placement_ids: z.array(z.number()),
});
export type RandomPicks = z.infer<typeof randomPicksSchema>;

/** Read suggestions for the live working copy; insertion uses the existing autosave queue. */
export function fetchRandomPicks(
  id: number,
  season_id: number,
  placement_ids: number[],
  excluded_hymn_ids: number[],
) {
  return request(`/masses/${id}/random-picks/`, randomPicksSchema, {
    method: 'POST',
    body: JSON.stringify({ season_id, placement_ids, excluded_hymn_ids }),
  });
}

export function fetchMasses(query: string) {
  return request(
    `/masses/${query ? `?${query}` : ''}`,
    z.object({
      count: z.number(),
      next: z.string().nullable(),
      previous: z.string().nullable(),
      results: z.array(summarySchema.extend({ is_archived: z.boolean() })),
    }),
  );
}
export function fetchMass(id: string) {
  return request(`/masses/${id}/`, massSchema);
}
export function createMass(metadata: MassMetadata) {
  return request('/masses/', massSchema, { method: 'POST', body: JSON.stringify(metadata) });
}
/** Metadata and program requests share the same precondition and are serialized by the saver. */
export function saveMass(id: number, revision: number, metadata: MassMetadata) {
  return request(`/masses/${id}/`, massSchema, {
    method: 'PATCH',
    headers: { 'X-Expected-Mass-Revision': String(revision) },
    body: JSON.stringify(metadata),
  });
}
export function saveProgram(id: number, revision: number, selections: SelectionInput[]) {
  return request(`/masses/${id}/program/`, programSchema, {
    method: 'PUT',
    headers: { 'X-Expected-Mass-Revision': String(revision) },
    body: JSON.stringify({ selections }),
  });
}
export function deleteMass(id: number, revision: number) {
  return request(`/masses/${id}/`, z.undefined(), {
    method: 'DELETE',
    headers: { 'X-Expected-Mass-Revision': String(revision) },
  });
}
