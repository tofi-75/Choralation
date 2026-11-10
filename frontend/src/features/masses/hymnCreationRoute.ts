import { z } from 'zod';

const stateSchema = z.object({
  fromMass: z.object({
    massId: z.number().int().positive(),
    choirId: z.number().int().positive(),
    placementId: z.number().int().positive(),
    search: z.string(),
    hymnId: z.number().int().positive().optional(),
  }),
});

export type MassHymnContext = z.infer<typeof stateSchema>['fromMass'];

export function massHymnContext(state: unknown) {
  const result = stateSchema.safeParse(state);
  return result.success ? result.data.fromMass : undefined;
}
