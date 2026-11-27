import { z } from 'zod';
import { request } from './client';

const summary = z.record(z.string(), z.unknown());
export const operationsSchema = z.object({
  enabled: z.boolean(),
  read_only: z.boolean(),
  reason: z.string(),
  started_at: z.string().nullable(),
  admin: z
    .object({
      phase: z.string(),
      operation_id: z.string(),
      backup_age_seconds: z.number().nullable(),
      backup_stale: z.boolean(),
      last_backup: summary,
      last_release: summary,
      last_restore: summary,
    })
    .optional(),
});
export const getOperations = () => request('/operations/status/', operationsSchema);
