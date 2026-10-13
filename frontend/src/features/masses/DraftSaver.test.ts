/** Exercise slow acknowledgements, row identity, partial save failure and disposal. */
import { afterEach, expect, it, vi } from 'vitest';

import { ApiError } from '../../api/client';
import type { Mass, MassMetadata, Program, SelectionInput } from '../../api/masses';
import { DraftSaver } from './DraftSaver';
import { category, hymn, mass } from './fixtures.test-support';

afterEach(() => vi.useRealTimers());
function acknowledged(revision: number, rows: SelectionInput[]): Program {
  return {
    mass_id: 1,
    revision,
    warnings: [],
    selections: rows.map((row, index) => ({
      id: row.id ?? index + 100,
      placement: { ...category, id: row.placement_id },
      hymn: { ...hymn, id: row.hymn_id },
      position: row.position,
      notes: row.notes,
      created_at: category.created_at,
      updated_at: category.updated_at,
    })),
  };
}
function row(key = 'new') {
  return { key, placement_id: 1, hymn, notes: '' };
}

it('explicit save waits for an in-flight autosave and every coalesced edit', async () => {
  vi.useFakeTimers();
  let release!: (saved: Program) => void;
  const program = vi.fn(async (_id: number, revision: number, rows: SelectionInput[]) =>
    acknowledged(revision + 1, rows),
  );
  program.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const saver = new DraftSaver(mass, { metadata: vi.fn(), program });
  saver.update({ ...saver.state.draft, rows: [row()] });
  const autosave = saver.flush();
  const explicitSave = saver.flush();
  expect(explicitSave).toBe(autosave);
  let finished = false;
  void explicitSave.then(() => {
    finished = true;
  });
  saver.update({ ...saver.state.draft, rows: [{ ...row(), notes: 'Latest notes' }] });
  await Promise.resolve();
  expect(finished).toBe(false);
  release(acknowledged(2, [{ placement_id: 1, hymn_id: 1, position: 0, notes: null }]));
  await explicitSave;
  expect(program).toHaveBeenCalledTimes(2);
  expect(program.mock.calls[1][2][0]).toMatchObject({ id: 100, notes: 'Latest notes' });
  expect(saver.state.status).toBe('Saved');
  expect(finished).toBe(true);
});

it('serializes and coalesces newer edits while preserving acknowledged new-row identity', async () => {
  let resolve!: (program: Program) => void;
  const program = vi.fn(async (_id: number, revision: number, rows: SelectionInput[]) =>
    acknowledged(revision + 1, rows),
  );
  program.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const metadata = vi.fn(
    async (_id: number, revision: number, input: MassMetadata): Promise<Mass> => ({
      ...mass,
      ...input,
      title: input.title ?? mass.title,
      revision: revision + 1,
    }),
  );
  const saver = new DraftSaver(mass, { metadata, program });
  saver.update({ ...saver.state.draft, rows: [row()] });
  const saving = saver.flush();
  saver.update({
    metadata: { ...saver.state.draft.metadata, title: 'Latest title' },
    rows: [{ ...row(), notes: 'Latest notes' }],
  });
  saver.update({ ...saver.state.draft, rows: [{ ...row(), notes: 'Final notes' }] });
  expect(program).toHaveBeenCalledTimes(1);
  expect(metadata).not.toHaveBeenCalled();
  expect(saver.state.status).toBe('Saving');
  resolve(acknowledged(2, program.mock.calls[0][2]));
  await saving;
  expect(metadata).toHaveBeenCalledWith(1, 2, expect.objectContaining({ title: 'Latest title' }));
  expect(program).toHaveBeenLastCalledWith(1, 3, [
    { id: 100, placement_id: 1, hymn_id: 1, position: 0, notes: 'Final notes' },
  ]);
  expect(saver.state.draft.rows[0].notes).toBe('Final notes');
  expect(saver.state.revision).toBe(4);
  expect(saver.state.status).toBe('Saved');
});

it('does not restore a row removed while its first save is pending', async () => {
  let resolve!: (program: Program) => void;
  const program = vi.fn(async (_id: number, revision: number, rows: SelectionInput[]) =>
    acknowledged(revision + 1, rows),
  );
  program.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const saver = new DraftSaver(mass, { metadata: vi.fn(), program });
  saver.update({ ...saver.state.draft, rows: [row()] });
  const saving = saver.flush();
  saver.update({ ...saver.state.draft, rows: [] });
  resolve(acknowledged(2, program.mock.calls[0][2]));
  await saving;
  expect(program).toHaveBeenLastCalledWith(1, 2, []);
  expect(saver.state.draft.rows).toEqual([]);
});

it('keeps errors and input until retry, without resending already saved metadata', async () => {
  const metadata = vi.fn(async () => ({ ...mass, title: 'Changed', revision: 2 }));
  const program = vi.fn(async (_id: number, revision: number, rows: SelectionInput[]) =>
    acknowledged(revision + 1, rows),
  );
  program.mockRejectedValueOnce(new Error('Offline'));
  const saver = new DraftSaver(mass, { metadata, program });
  saver.update({ metadata: { ...saver.state.draft.metadata, title: 'Changed' }, rows: [row()] });
  await saver.flush();
  expect(saver.state.status).toBe('Unable to save');
  expect(saver.state.revision).toBe(2);
  saver.update({ ...saver.state.draft, rows: [{ ...row(), notes: 'Kept while offline' }] });
  await saver.flush();
  expect(program).toHaveBeenCalledTimes(1);
  saver.retry();
  await vi.waitFor(() => expect(saver.state.status).toBe('Saved'));
  expect(metadata).toHaveBeenCalledTimes(1);
  expect(program).toHaveBeenLastCalledWith(1, 2, [
    expect.objectContaining({ notes: 'Kept while offline' }),
  ]);
});

it('preserves a conflicting local version and never retries automatically', async () => {
  vi.useFakeTimers();
  const metadata = vi
    .fn()
    .mockRejectedValue(new ApiError('Changed elsewhere', 'revision_conflict', 412));
  const saver = new DraftSaver(mass, { metadata, program: vi.fn() });
  saver.update({
    ...saver.state.draft,
    metadata: { ...saver.state.draft.metadata, title: 'Local version' },
  });
  await vi.advanceTimersByTimeAsync(600);
  expect(saver.state.status).toBe('Unable to save');
  saver.update({
    ...saver.state.draft,
    metadata: { ...saver.state.draft.metadata, title: 'Further local edits' },
  });
  await vi.advanceTimersByTimeAsync(10_000);
  expect(metadata).toHaveBeenCalledTimes(1);
  expect(saver.state.draft.metadata.title).toBe('Further local edits');
});

it('stops queued writes after the planner is unmounted', async () => {
  let resolve!: (program: Program) => void;
  const program = vi.fn(
    () =>
      new Promise<Program>((done) => {
        resolve = done;
      }),
  );
  const saver = new DraftSaver(mass, { metadata: vi.fn(), program });
  const unsubscribe = saver.subscribe(() => {});
  saver.update({ ...saver.state.draft, rows: [row()] });
  const saving = saver.flush();
  saver.update({ ...saver.state.draft, rows: [row(), row('other')] });
  unsubscribe();
  resolve(acknowledged(2, [{ placement_id: 1, hymn_id: 1, position: 0, notes: null }]));
  await saving;
  expect(program).toHaveBeenCalledTimes(1);
  expect(saver.state.status).toBe('Unsaved');
});

it('applies canonical metadata and does not resend it during the next program edit', async () => {
  const title = 'Sunday Mass — October 07, 2026';
  const metadata = vi.fn(async () => ({ ...mass, title, notes: 'Trimmed notes', revision: 2 }));
  const program = vi.fn(async (_id: number, revision: number, rows: SelectionInput[]) =>
    acknowledged(revision + 1, rows),
  );
  const saver = new DraftSaver(mass, { metadata, program });
  saver.update({
    ...saver.state.draft,
    metadata: { ...saver.state.draft.metadata, title: '', notes: '  Trimmed notes  ' },
  });
  await saver.flush();
  expect(saver.state.draft.metadata).toEqual({
    date: mass.date,
    title,
    notes: 'Trimmed notes',
    liturgical_season_id: null,
  });
  expect(saver.state.status).toBe('Saved');
  saver.update({ ...saver.state.draft, rows: [row()] });
  await saver.flush();
  expect(metadata).toHaveBeenCalledTimes(1);
  expect(program).toHaveBeenCalledWith(1, 2, expect.any(Array));
});

it('preserves metadata edited after a request while applying its canonical acknowledgement', async () => {
  let resolve!: (saved: Mass) => void;
  const metadata = vi.fn(
    async (_id: number, revision: number, input: MassMetadata): Promise<Mass> => ({
      ...mass,
      ...input,
      title: input.title ?? 'Generated title',
      liturgical_season: input.liturgical_season_id
        ? { ...category, id: input.liturgical_season_id }
        : null,
      revision: revision + 1,
    }),
  );
  metadata.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const saver = new DraftSaver(mass, { metadata, program: vi.fn() });
  saver.update({
    ...saver.state.draft,
    metadata: { ...saver.state.draft.metadata, title: '', notes: 'Old notes' },
  });
  const saving = saver.flush();
  saver.update({
    ...saver.state.draft,
    metadata: {
      ...saver.state.draft.metadata,
      date: '2026-10-08',
      title: 'Newer title',
      notes: 'Newer notes',
      liturgical_season_id: 2,
    },
  });
  resolve({ ...mass, title: 'Generated title', notes: 'Old notes', revision: 2 });
  await saving;
  expect(metadata).toHaveBeenLastCalledWith(1, 2, {
    date: '2026-10-08',
    title: 'Newer title',
    notes: 'Newer notes',
    liturgical_season_id: 2,
  });
  expect(saver.state.draft.metadata.title).toBe('Newer title');
  expect(saver.state.draft.metadata.liturgical_season_id).toBe(2);
  expect(saver.state.status).toBe('Saved');
});

it('never starts the program request when disposed during metadata saving', async () => {
  let resolve!: (saved: Mass) => void;
  const metadata = vi.fn(
    () =>
      new Promise<Mass>((done) => {
        resolve = done;
      }),
  );
  const program = vi.fn();
  const saver = new DraftSaver(mass, { metadata, program });
  const unsubscribe = saver.subscribe(() => {});
  saver.update({
    metadata: { ...saver.state.draft.metadata, title: 'Changed' },
    rows: [row()],
  });
  const saving = saver.flush();
  unsubscribe();
  resolve({ ...mass, title: 'Changed', revision: 2 });
  await saving;
  expect(program).not.toHaveBeenCalled();
  expect(saver.state.revision).toBe(2);
  expect(saver.state.status).toBe('Unsaved');
});

it('refreshes live warnings without scheduling writes and ignores older references', async () => {
  vi.useFakeTimers();
  const metadata = vi.fn();
  const program = vi.fn();
  const selected = acknowledged(1, [{ placement_id: 1, hymn_id: 1, position: 0, notes: null }]);
  const initial = { ...mass, program: selected.selections };
  const saver = new DraftSaver(initial, { metadata, program });
  const refreshed = selected.selections.map((selection) => ({
    ...selection,
    hymn: {
      ...selection.hymn,
      title: 'Renamed hymn',
      is_active: false,
      placements: [],
      updated_at: '2026-10-08T00:00:00Z',
    },
  }));
  saver.refreshReferences(refreshed);
  expect(saver.state.draft.rows[0].hymn.title).toBe('Renamed hymn');
  expect(saver.programWarnings.map((warning) => warning.code)).toEqual([
    'placement_mismatch',
    'inactive_selection',
  ]);
  saver.refreshReferences(initial.program);
  expect(saver.state.draft.rows[0].hymn.is_active).toBe(false);
  await vi.advanceTimersByTimeAsync(1000);
  expect(metadata).not.toHaveBeenCalled();
  expect(program).not.toHaveBeenCalled();
  expect(saver.state.status).toBe('Saved');
  expect(saver.state.revision).toBe(1);
});

it('refreshes references without replacing local metadata, rows, order, notes, or save state', () => {
  vi.useFakeTimers();
  const selected = acknowledged(1, [
    { placement_id: 1, hymn_id: 1, position: 0, notes: 'Saved notes' },
    { placement_id: 1, hymn_id: 2, position: 1, notes: null },
  ]);
  const saver = new DraftSaver({ ...mass, program: selected.selections });
  const [first, second] = saver.state.draft.rows;
  const rows = [
    second,
    { ...first, notes: 'Local notes' },
    { ...row('new'), hymn: { ...hymn, id: 3 } },
  ];
  const metadata = { ...saver.state.draft.metadata, title: 'Local title', liturgical_season_id: 2 };
  saver.update({ metadata, rows });
  saver.refreshReferences(
    [
      {
        ...selected.selections[0],
        notes: 'Other writer notes',
        hymn: {
          ...hymn,
          title: 'Renamed',
          is_season_neutral: false,
          seasons: [{ ...category, id: 99, name: 'Other season' }],
          updated_at: '2026-10-08T00:00:00Z',
        },
      },
    ],
    [{ ...category, is_active: false, updated_at: '2026-10-08T00:00:00Z' }],
  );
  expect(saver.state.draft.metadata).toEqual(metadata);
  expect(
    saver.state.draft.rows.map((row) => [row.key, row.id, row.placement_id, row.notes]),
  ).toEqual(rows.map((row) => [row.key, row.id, row.placement_id, row.notes]));
  expect(saver.state.draft.rows[1].hymn.title).toBe('Renamed');
  expect(saver.programWarnings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'season_mismatch', hymn_id: 1 }),
      expect.objectContaining({ code: 'inactive_selection', hymn_id: 2 }),
    ]),
  );
  expect(saver.state.status).toBe('Unsaved');
  expect(saver.state.revision).toBe(1);
});
