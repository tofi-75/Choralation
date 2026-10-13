/** Concurrent manual edits and date/season changes must survive random suggestions. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { fetchRandomPicks } from '../../api/masses';
import type { RandomPicks } from '../../api/masses';
import { DraftSaver } from './DraftSaver';
import { category, hymn, mass } from './fixtures.test-support';
import { insertRandomPicks, RandomPicker } from './RandomPicker';

vi.mock('../../api/masses', async (original) => ({
  ...(await original<typeof import('../../api/masses')>()),
  fetchRandomPicks: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});
const placement2 = { ...category, id: 2, name: 'Entrance' };
const placements = [category, placement2];
const picks = [
  { placement_id: 1, hymn },
  { placement_id: 2, hymn: { ...hymn, id: 2, placements: [placement2] } },
];
function saverWithSeason() {
  vi.useFakeTimers();
  return new DraftSaver({ ...mass, liturgical_season: { ...category, id: 7 } });
}
function pending() {
  let finish!: (response: RandomPicks) => void;
  vi.mocked(fetchRandomPicks).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  return (response: RandomPicks) => act(async () => finish(response));
}

it('preserves current rows, notes and metadata, while skipping occupied slots and duplicate hymns', () => {
  const saver = saverWithSeason();
  const retained = { key: 'manual', id: 99, placement_id: 1, hymn, notes: 'Choir notes' };
  const draft = { ...saver.state.draft, rows: [retained] };
  const next = insertRandomPicks(
    draft,
    [picks[0], { placement_id: 2, hymn }, picks[1]],
    placements,
  );
  expect(next.rows).toHaveLength(2);
  expect(next.rows[0]).toBe(retained);
  expect(next.metadata).toBe(draft.metadata);
  expect(next.rows[1]).toMatchObject({ placement_id: 2, hymn: { id: 2 }, notes: '' });
});

it('rejects inactive, wrong-season, wrong-placement and inactive-placement suggestions', () => {
  const saver = saverWithSeason();
  const next = insertRandomPicks(
    saver.state.draft,
    [
      { placement_id: 1, hymn: { ...hymn, is_active: false } },
      { placement_id: 1, hymn: { ...hymn, is_season_neutral: false, seasons: [] } },
      { placement_id: 1, hymn: { ...hymn, placements: [] } },
      picks[1],
    ],
    [category, { ...placement2, is_active: false }],
  );
  expect(next.rows).toEqual([]);
});

it('inserts into the latest working copy and queues autosave, keeping manual edits made while waiting', async () => {
  const saver = saverWithSeason();
  const finish = pending();
  render(<RandomPicker massId={1} saver={saver} placements={placements} calendarPending={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Random hymns' }));
  expect(fetchRandomPicks).toHaveBeenCalledWith(1, 7, [1, 2], []);
  expect(screen.getByRole('button', { name: 'Picking hymns…' })).toBeDisabled();
  const manual = { key: 'manual', placement_id: 1, hymn, notes: 'New note' };
  saver.update({ ...saver.state.draft, rows: [manual] });
  await finish({ picks, unfilled_placement_ids: [] });
  expect(saver.state.draft.rows[0]).toBe(manual);
  expect(saver.state.draft.rows).toHaveLength(2);
  expect(saver.state.status).toBe('Unsaved');
  expect(screen.getByRole('status')).toHaveTextContent(
    '1 random hymn added. All placements are filled.',
  );
});

it('does not insert an old response after date/season changes or component unmount', async () => {
  const saver = saverWithSeason();
  let finish = pending();
  const mounted = render(
    <RandomPicker massId={1} saver={saver} placements={placements} calendarPending={false} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Random hymns' }));
  saver.update({
    ...saver.state.draft,
    metadata: { ...saver.state.draft.metadata, liturgical_season_id: 8 },
  });
  await finish({ picks, unfilled_placement_ids: [] });
  expect(saver.state.draft.rows).toEqual([]);
  finish = pending();
  fireEvent.click(screen.getByRole('button', { name: 'Random hymns' }));
  mounted.unmount();
  await finish({ picks, unfilled_placement_ids: [] });
  expect(saver.state.draft.rows).toEqual([]);
});

it('reports an empty eligible pool and leaves choices intact after a failed request', async () => {
  const saver = saverWithSeason();
  vi.mocked(fetchRandomPicks).mockResolvedValueOnce({ picks: [], unfilled_placement_ids: [1, 2] });
  render(<RandomPicker massId={1} saver={saver} placements={placements} calendarPending={false} />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Random hymns' })));
  expect(screen.getByRole('status')).toHaveTextContent('Still empty: Communion, Entrance');
  expect(saver.state.status).toBe('Saved');
  vi.mocked(fetchRandomPicks).mockRejectedValueOnce(new Error('Connection failed.'));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Random hymns' })));
  expect(screen.getByRole('alert')).toHaveTextContent('Your selections are unchanged. Try again.');
  expect(saver.state.draft.rows).toEqual([]);
});

it('requires a season and waits for the calendar lookup before enabling random picks', () => {
  const saver = saverWithSeason();
  const mounted = render(
    <RandomPicker massId={1} saver={saver} placements={placements} calendarPending />,
  );
  expect(screen.getByRole('button', { name: 'Random hymns' })).toBeDisabled();
  saver.update({
    ...saver.state.draft,
    metadata: { ...saver.state.draft.metadata, liturgical_season_id: null },
  });
  mounted.rerender(
    <RandomPicker massId={1} saver={saver} placements={placements} calendarPending={false} />,
  );
  expect(screen.getByRole('button', { name: 'Random hymns' })).toBeDisabled();
  expect(screen.getByText('Select a liturgical season to pick random hymns.')).toBeVisible();
  expect(fetchRandomPicks).not.toHaveBeenCalled();
});

it('inserts distinct rows on HTTP browsers that do not expose crypto.randomUUID', () => {
  vi.stubGlobal('crypto', undefined);
  const saver = saverWithSeason();
  const next = insertRandomPicks(saver.state.draft, picks, placements);
  expect(next.rows).toHaveLength(2);
  expect(new Set(next.rows.map((row) => row.key)).size).toBe(2);
  expect(insertRandomPicks(saver.state.draft, picks, placements).rows[0].key).not.toBe(
    next.rows[0].key,
  );
});
