/** Apply date and suggested season together; stale requests cannot replace a newer choice.
 * Existing plans are untouched on mount. New drafts request their initial Sunday.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Category } from '../../api/library';
import { fetchCalendar } from './calendar';

export function MassDateFields({
  date,
  season,
  seasons,
  initialSuggestion = false,
  onChange,
  onPending,
}: {
  date: string;
  season: number | null;
  seasons: Category[];
  initialSuggestion?: boolean;
  onChange: (date: string, season: number | null) => void;
  onPending: (pending: boolean) => void;
}) {
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const sequence = useRef(0);
  const initialRequested = useRef(false);
  const suggest = useCallback(
    async (day: string) => {
      const token = ++sequence.current;
      setPendingDate(day);
      onPending(true);
      setNotice('');
      try {
        const result = await fetchCalendar(day);
        if (token !== sequence.current) return;
        onChange(day, result.season_id);
        setNotice(
          result.season_id
            ? `Maronite · ${result.season_name}${result.day_title ? ` · ${result.day_title}` : ''}`
            : `Maronite · ${result.season_name} is unavailable. Choose a season manually.`,
        );
      } catch {
        if (token !== sequence.current) return;
        // The chosen date is still usable when our own calendar endpoint is unavailable.
        onChange(day, null);
        setNotice('Calendar unavailable. Choose a season manually.');
      } finally {
        if (token === sequence.current) {
          setPendingDate(null);
          onPending(false);
        }
      }
    },
    [onChange, onPending],
  );
  useEffect(() => {
    if (initialSuggestion && !initialRequested.current) {
      initialRequested.current = true;
      void suggest(date);
    }
  }, [date, initialSuggestion, suggest]);
  useEffect(
    () => () => {
      sequence.current += 1;
      initialRequested.current = false;
    },
    [],
  );
  return (
    <>
      <label className="field">
        Date
        <input
          type="date"
          name="date"
          required
          value={pendingDate ?? date}
          onChange={(event) => {
            if (event.target.value) void suggest(event.target.value);
            else {
              sequence.current += 1;
              setPendingDate(null);
              onPending(false);
              onChange('', null);
              setNotice('');
            }
          }}
        />
      </label>
      <label className="field">
        Liturgical season
        <select
          name="season"
          value={season ?? ''}
          onChange={(event) => {
            sequence.current += 1;
            onChange(pendingDate ?? date, event.target.value ? Number(event.target.value) : null);
            setPendingDate(null);
            onPending(false);
            setNotice('Season selected manually.');
          }}
        >
          <option value="">No season selected</option>
          {seasons
            .filter((row) => row.is_active || row.id === season)
            .map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
                {!row.is_active && ' (inactive)'}
              </option>
            ))}
        </select>
      </label>
      {(pendingDate || notice) && (
        <p className="tiny calendar-notice full-width" role="status" dir="auto">
          {pendingDate ? 'Selecting the Maronite season…' : notice}
        </p>
      )}
    </>
  );
}
