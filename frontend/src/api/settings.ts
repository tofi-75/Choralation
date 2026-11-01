import { z } from 'zod';
import { request } from './client';
import { categorySchema } from './library';
import type { Category, CategoryKind } from './library';

export const categoryDetailSchema = categorySchema.extend({
  reference_counts: z.record(z.string(), z.number()),
});
export const listCategories = (kind: CategoryKind) =>
  request(`/${kind}/?is_active=all`, z.array(categorySchema));
export const categoryImpact = (kind: CategoryKind, id: number) =>
  request(`/${kind}/${id}/`, categoryDetailSchema);
export const saveCategory = (
  kind: CategoryKind,
  row: Category | null,
  data: { name: string; description: string },
) =>
  request(`/${kind}/${row ? `${row.id}/` : ''}`, categoryDetailSchema, {
    method: row ? 'PATCH' : 'POST',
    body: JSON.stringify({ ...data, ...(row ? { expected_updated_at: row.updated_at } : {}) }),
  });
export const deactivateCategory = (kind: CategoryKind, row: Category) =>
  request(`/${kind}/${row.id}/`, categoryDetailSchema, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: !row.is_active, expected_updated_at: row.updated_at }),
  });
export const deleteCategory = (kind: CategoryKind, row: Category) =>
  request(`/${kind}/${row.id}/`, z.undefined(), { method: 'DELETE' });
export const reorderCategories = (kind: CategoryKind, rows: Category[], ids: number[]) =>
  request(`/${kind}/reorder/`, z.object({ results: z.array(categorySchema) }), {
    method: 'POST',
    body: JSON.stringify({
      ordered_ids: ids,
      expected_versions: Object.fromEntries(rows.map((r) => [String(r.id), r.updated_at])),
    }),
  });
export const calendarSettingsSchema = z.object({
  calendar: z.enum(['maronite', 'manual']),
  time_zone: z.string(),
  version: z.number(),
  time_zones: z.array(z.string()),
  overrides: z.array(
    z.object({
      date: z.string(),
      season_id: z.number(),
      season_name: z.string(),
      is_active: z.boolean(),
    }),
  ),
});
export type CalendarSettings = z.infer<typeof calendarSettingsSchema>;
export const getCalendarSettings = (id: number) =>
  request(`/choirs/${id}/calendar/`, calendarSettingsSchema);
export const saveCalendarSettings = (
  id: number,
  data: Pick<CalendarSettings, 'calendar' | 'time_zone' | 'version'>,
) =>
  request(`/choirs/${id}/calendar/`, calendarSettingsSchema, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
export const saveCalendarOverride = (
  id: number,
  date: string,
  season_id: number | null,
  version: number,
) =>
  request(`/choirs/${id}/calendar/overrides/`, calendarSettingsSchema, {
    method: 'POST',
    body: JSON.stringify({ date, season_id, version }),
  });
export function settingsError(error: unknown): string {
  if (error && typeof error === 'object' && 'fields' in error)
    return [
      error instanceof Error ? error.message : 'Unable to save.',
      ...Object.values((error as { fields: Record<string, unknown> }).fields)
        .flat()
        .filter((v) => typeof v === 'string'),
    ].join(' ');
  return error instanceof Error ? error.message : 'Unable to save. Please try again.';
}
