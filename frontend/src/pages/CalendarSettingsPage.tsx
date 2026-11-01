import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { fetchChoir } from '../api/choirs';
import {
  getCalendarSettings,
  saveCalendarSettings,
  saveCalendarOverride,
  settingsError,
} from '../api/settings';
import type { CalendarSettings } from '../api/settings';
import { useCategories } from '../features/hymns/queries';
import { fetchCalendar } from '../features/masses/calendar';
import { useUnsavedSettings } from '../components/useUnsavedSettings';

export function CalendarSettingsPage() {
  const { id } = useParams();
  const [saved, setSaved] = useState(false);
  const choir = useQuery({ queryKey: ['choir', id], queryFn: () => fetchChoir(id!) });
  const query = useQuery({
    queryKey: ['choir-calendar', Number(id)],
    queryFn: () => getCalendarSettings(Number(id)),
    refetchOnWindowFocus: false,
  });
  if (choir.error || query.error)
    return (
      <section>
        <h1>Choir calendar</h1>
        <p role="alert">{choir.error?.message ?? query.error?.message}</p>
        <button
          className="button secondary"
          onClick={() => {
            void choir.refetch();
            void query.refetch();
          }}
        >
          Retry
        </button>
      </section>
    );
  if (!choir.data || !query.data) return <p role="status">Loading calendar settings…</p>;
  return (
    <>
      <Link to={`/choirs/${id}`}>← {choir.data.name}</Link>
      <h1 className="page-title">Choir calendar</h1>
      <p>
        Defaults and overrides apply to future suggestions. Existing Mass dates and seasons remain
        unchanged.
      </p>
      {saved && (
        <p className="notice" role="status">
          Calendar settings saved.
        </p>
      )}
      <CalendarEditor
        key={`${id}-${query.data.version}`}
        id={Number(id)}
        data={query.data}
        onSaved={() => setSaved(true)}
        editable={choir.data.role === 'Planner'}
      />
    </>
  );
}
function CalendarEditor({
  id,
  data,
  editable,
  onSaved,
}: {
  id: number;
  data: CalendarSettings;
  editable: boolean;
  onSaved: () => void;
}) {
  const client = useQueryClient();
  const categories = useCategories();
  const [calendar, setCalendar] = useState(data.calendar);
  const [zone, setZone] = useState(data.time_zone);
  const [date, setDate] = useState('');
  const [season, setSeason] = useState('');
  const [preview, setPreview] = useState('');
  const previewRequest = useRef(0);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const dirty = calendar !== data.calendar || zone !== data.time_zone;
  useUnsavedSettings(dirty || Boolean(date || season));
  async function run(work: () => ReturnType<typeof saveCalendarSettings>) {
    setPending(true);
    setError('');
    try {
      const saved = await work();
      client.setQueryData(['choir-calendar', id], saved);
      onSaved();
      await client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
    } catch (e) {
      setError(settingsError(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="settings-calendar">
      <section className="form-section">
        <h2>Calendar defaults</h2>
        {!editable && <p className="notice">Your choir planners manage these settings.</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() =>
              saveCalendarSettings(id, { calendar, time_zone: zone, version: data.version }),
            );
          }}
        >
          <div className="form-grid">
            <label className="field">
              Calendar
              <select
                disabled={!editable || pending}
                value={calendar}
                onChange={(e) => setCalendar(e.target.value as CalendarSettings['calendar'])}
              >
                <option value="maronite">Maronite</option>
                <option value="manual">Manual season selection</option>
              </select>
            </label>
            <label className="field">
              Timezone
              <select
                disabled={!editable || pending}
                value={zone}
                onChange={(e) => setZone(e.target.value)}
              >
                {data.time_zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {editable && (
            <div className="form-actions">
              <button className="button primary" disabled={pending || !dirty}>
                Save calendar settings
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={pending || !dirty}
                onClick={() => {
                  setCalendar(data.calendar);
                  setZone(data.time_zone);
                }}
              >
                Discard changes
              </button>
            </div>
          )}
        </form>
      </section>
      <section className="form-section">
        <h2>Date overrides</h2>
        <p>
          An override takes priority over automatic or manual defaults for that date. Removing it
          restores the configured default.
        </p>
        {data.overrides.length ? (
          <ul className="settings-list">
            {data.overrides.map((row) => (
              <li className="settings-row" key={row.date}>
                <div>
                  <strong>{row.date}</strong>
                  <p dir="auto">
                    {row.season_name}
                    {!row.is_active ? ' (inactive; choose a season manually)' : ''}
                  </p>
                </div>
                {editable && (
                  <button
                    className="button secondary"
                    disabled={pending || dirty}
                    onClick={() => {
                      if (window.confirm(`Remove the override for ${row.date}?`))
                        void run(() => saveCalendarOverride(id, row.date, null, data.version));
                    }}
                  >
                    Remove override
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>No date overrides.</p>
        )}
        {editable && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => saveCalendarOverride(id, date, Number(season), data.version));
            }}
          >
            {dirty && (
              <p className="notice">Save or discard calendar defaults before editing overrides.</p>
            )}
            {categories.error && (
              <p role="alert">
                Unable to load seasons.{' '}
                <button type="button" onClick={() => void categories.refetch()}>
                  Retry seasons
                </button>
              </p>
            )}
            <div className="form-grid">
              <label className="field">
                Override date
                <input
                  type="date"
                  required
                  min="1900-01-01"
                  max="2199-12-31"
                  value={date}
                  disabled={pending || dirty}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="field">
                Override season
                <select
                  required
                  value={season}
                  disabled={pending || dirty}
                  onChange={(e) => setSeason(e.target.value)}
                >
                  <option value="">Choose a season</option>
                  {categories.data?.['liturgical-seasons']
                    .filter((s) => s.is_active)
                    .map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <button className="button primary" disabled={pending || dirty || !date || !season}>
              Save date override
            </button>
          </form>
        )}
      </section>
      <section className="form-section">
        <h2>Preview a date</h2>
        <p>
          Preview uses saved settings. Provider failures fall back to local suggestions; you can
          always choose a season manually.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const day = String(new FormData(e.currentTarget).get('preview-date'));
            const request = ++previewRequest.current;
            setPreview('Loading preview…');
            try {
              const result = await fetchCalendar(day, id);
              if (request !== previewRequest.current) return;
              setPreview(
                `${result.season_name} · Source: ${result.source}${result.day_title ? ` · ${result.day_title}` : ''}`,
              );
            } catch (e) {
              if (request === previewRequest.current) setPreview(settingsError(e));
            }
          }}
        >
          <label className="field">
            Preview date
            <input type="date" name="preview-date" required min="1900-01-01" max="2199-12-31" />
          </label>
          <button className="button secondary">Preview suggestion</button>
        </form>
        <p role="status" dir="auto">
          {preview}
        </p>
      </section>
      {error && (
        <div className="notice error">
          <p role="alert">{error}</p>
          <button
            className="button secondary"
            disabled={pending}
            onClick={async () => {
              if (!window.confirm('Reload saved settings and discard unsaved changes?')) return;
              setPending(true);
              try {
                const saved = await getCalendarSettings(id);
                setCalendar(saved.calendar);
                setZone(saved.time_zone);
                setDate('');
                setSeason('');
                setError('');
                client.setQueryData(['choir-calendar', id], saved);
              } catch (e) {
                setError(settingsError(e));
              } finally {
                setPending(false);
              }
            }}
          >
            Reload saved settings
          </button>
        </div>
      )}
    </div>
  );
}
