/** Fill empty placements through the normal autosave queue, preserving newer edits. */
import { useEffect, useRef, useState } from 'react';

import type { Category } from '../../api/library';
import { fetchRandomPicks } from '../../api/masses';
import type { RandomPicks } from '../../api/masses';
import { newRowKey } from './rowKey';
import type { Draft, DraftSaver } from './DraftSaver';

/** Recheck against the latest draft: a manual choice may arrive during the request. */
export function insertRandomPicks(
  draft: Draft,
  picks: RandomPicks['picks'],
  placements: Category[],
) {
  const rows = [...draft.rows];
  const occupied = new Set(rows.map((row) => row.placement_id));
  const used = new Set(rows.map((row) => row.hymn.id));
  const active = new Set(placements.filter((row) => row.is_active).map((row) => row.id));
  for (const { placement_id, hymn } of picks) {
    if (
      occupied.has(placement_id) ||
      used.has(hymn.id) ||
      !active.has(placement_id) ||
      !hymn.is_active ||
      !hymn.placements.some((row) => row.id === placement_id) ||
      (!hymn.is_season_neutral &&
        !hymn.seasons.some((row) => row.id === draft.metadata.liturgical_season_id))
    )
      continue;
    rows.push({ key: newRowKey(), placement_id, hymn, notes: '' });
    occupied.add(placement_id);
    used.add(hymn.id);
  }
  return { ...draft, rows };
}

/** Parent keys this component by date/season/calendar activity. Unmount cancels
 * application of an old response, without interrupting existing program saves.
 */
export function RandomPicker({
  massId,
  saver,
  placements,
  calendarPending,
  onPending,
}: {
  massId: number;
  saver: DraftSaver;
  placements: Category[];
  calendarPending: boolean;
  onPending?: (pending: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const active = useRef(false);
  const running = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      onPending?.(false);
    };
  }, [onPending]);
  const { draft } = saver.state;
  const season = draft.metadata.liturgical_season_id;
  const empty = placements.filter(
    (placement) =>
      placement.is_active && !draft.rows.some((row) => row.placement_id === placement.id),
  );
  async function pick() {
    if (!season || calendarPending || running.current || empty.length === 0) return;
    running.current = true;
    onPending?.(true);
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await fetchRandomPicks(
        massId,
        season,
        empty.map((row) => row.id),
        [...new Set(draft.rows.map((row) => row.hymn.id))],
      );
      if (!active.current) return;
      const current = saver.state.draft;
      // Also check synchronously in case metadata changed before the next render.
      if (
        current.metadata.date !== draft.metadata.date ||
        current.metadata.liturgical_season_id !== season
      )
        return;
      const next = insertRandomPicks(current, result.picks, placements);
      const count = next.rows.length - current.rows.length;
      if (count) saver.update(next);
      const unfilled = placements.filter(
        (placement) =>
          placement.is_active && !next.rows.some((row) => row.placement_id === placement.id),
      );
      setMessage(
        `${count} random ${count === 1 ? 'hymn' : 'hymns'} added. ` +
          (unfilled.length
            ? `Still empty: ${unfilled.map((row) => row.name).join(', ')}. Try again or add hymns manually.`
            : 'All placements are filled.'),
      );
    } catch (failure) {
      if (active.current)
        setError(failure instanceof Error ? failure.message : 'Unable to pick hymns. Try again.');
    } finally {
      running.current = false;
      if (active.current) {
        setBusy(false);
        onPending?.(false);
      }
    }
  }
  return (
    <div className="random-picker">
      <button
        className="button secondary"
        disabled={
          busy || calendarPending || !season || empty.length === 0 || Boolean(saver.state.error)
        }
        onClick={() => void pick()}
      >
        {busy ? 'Picking hymns…' : 'Random hymns'}
      </button>
      <p className="tiny muted">
        {season
          ? 'Fill empty placements for this season, including season-neutral hymns. Keeps your choices; avoids repeats.'
          : 'Select a liturgical season to pick random hymns.'}
      </p>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error} Your selections are unchanged. Try again.</p>}
    </div>
  );
}
