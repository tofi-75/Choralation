/** Search saved drafts; new plans default to the nearest Sunday and Maronite season. */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { createMass, fetchMasses } from '../api/masses';
import { useSession } from '../features/auth/SessionProvider';
import { useCategories } from '../features/hymns/queries';
import { nearestSunday } from '../features/masses/calendar';
import { MassDateFields } from '../features/masses/MassDateFields';

export function MassesPage() {
  const [params, setParams] = useSearchParams();
  const query = useQuery({
    queryKey: ['masses', params.toString()],
    queryFn: () => fetchMasses(params.toString()),
  });
  const categories = useCategories();
  const { user } = useSession();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [newDate, setNewDate] = useState(nearestSunday);
  const [newSeason, setNewSeason] = useState<number | null>(null);
  const [calendarPending, setCalendarPending] = useState(false);
  const changeDate = useCallback((day: string, season: number | null) => {
    setNewDate(day);
    setNewSeason(season);
  }, []);
  const filtered = ['q', 'from', 'to', 'season', 'status'].some((key) => params.has(key));
  const results = query.data?.results ?? [];
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Weekly planning</p>
          <h1 className="page-title">Mass plans</h1>
          <p className="muted">Prepare and save your team's draft programs.</p>
        </div>
        {user?.role !== 'Viewer' && (
          <button
            className="button primary"
            aria-expanded={creating}
            aria-controls="create-mass"
            onClick={() => {
              if (!creating) {
                setNewDate(nearestSunday());
                setNewSeason(null);
              }
              setCreating(!creating);
            }}
          >
            Create Mass
          </button>
        )}
      </div>
      {creating && (
        <form
          id="create-mass"
          className="form-section"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending || calendarPending) return;
            const data = new FormData(event.currentTarget);
            setPending(true);
            setFailure(null);
            try {
              const saved = await createMass({
                date: String(data.get('date')),
                title: String(data.get('title')).trim() || null,
                notes: String(data.get('notes')).trim() || null,
                liturgical_season_id: data.get('season') ? Number(data.get('season')) : null,
              });
              void client.invalidateQueries({ queryKey: ['masses'] });
              navigate(`/masses/${saved.id}/edit`);
            } catch (error) {
              setFailure(error instanceof Error ? error.message : 'Unable to create Mass.');
            } finally {
              setPending(false);
            }
          }}
        >
          <h2>Create a draft Mass</h2>
          <fieldset disabled={pending} className="form-grid">
            <legend className="sr-only">Mass details</legend>
            <MassDateFields
              date={newDate}
              season={newSeason}
              seasons={categories.data?.['liturgical-seasons'] ?? []}
              initialSuggestion
              onChange={changeDate}
              onPending={setCalendarPending}
            />
            <details className="optional-details planner-details">
              <summary>Title and notes (optional)</summary>
              <div className="form-grid">
                <label className="field">
                  Title
                  <input
                    name="title"
                    maxLength={255}
                    placeholder="Leave blank for a date-based title"
                    dir="auto"
                  />
                </label>
                <label className="field">
                  Notes
                  <textarea name="notes" dir="auto" />
                </label>
              </div>
            </details>
          </fieldset>
          {categories.error && (
            <p className="notice error" role="alert">
              Season choices could not refresh. You can add a season later.
            </p>
          )}
          {failure && (
            <p className="notice error" role="alert">
              {failure} Your input has been kept.
            </p>
          )}
          <div className="form-actions">
            <button className="button primary" disabled={pending || calendarPending}>
              {pending ? 'Creating…' : 'Next'}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={pending}
              onClick={() => setCreating(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <section className="form-section" aria-label="Mass filters">
        <label className="field">
          Search Mass plans
          <input
            value={params.get('q') ?? ''}
            onChange={(event) => filter('q', event.target.value)}
          />
        </label>
        <details
          className="optional-details mass-filters"
          open={['from', 'to', 'season'].some((key) => params.has(key))}
        >
          <summary>Filter by date or season</summary>
          <div className="form-grid">
            <label className="field">
              From date
              <input
                type="date"
                value={params.get('from') ?? ''}
                onChange={(event) => filter('from', event.target.value)}
              />
            </label>
            <label className="field">
              To date
              <input
                type="date"
                value={params.get('to') ?? ''}
                onChange={(event) => filter('to', event.target.value)}
              />
            </label>
            <label className="field">
              Season filter
              <select
                value={params.get('season') ?? ''}
                onChange={(event) => filter('season', event.target.value)}
              >
                <option value="">All seasons</option>
                {categories.data?.['liturgical-seasons'].map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                    {!row.is_active && ' (inactive)'}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
        {filtered && (
          <button className="text-button" onClick={() => setParams({}, { replace: true })}>
            Clear filters
          </button>
        )}
      </section>
      {query.isPending && <p role="status">Loading Mass plans…</p>}
      {query.error && (
        <p role="alert">
          {query.error.message}{' '}
          <button className="button secondary" onClick={() => void query.refetch()}>
            Try again
          </button>
        </p>
      )}
      {query.data && (
        <>
          <p className="muted">{query.data.count} saved plans</p>
          {[
            { label: 'Today and upcoming', archived: false },
            { label: 'Archived', archived: true },
          ].map((group) => {
            // Keep the server's global ordering/pagination and date grouping;
            // a phone's timezone must not disagree with the team's local day.
            const masses = results.filter((mass) => mass.is_archived === group.archived);
            if (!masses.length) return null;
            return (
              <section className="mass-group" aria-label={group.label} key={group.label}>
                <h2 className="mass-group-heading">{group.label}</h2>
                <div className="mass-list">
                  {masses.map((mass) => (
                    <Link className="mass-card" to={`/masses/${mass.id}`} key={mass.id}>
                      <span className="eyebrow">
                        {mass.date} · {mass.status}
                      </span>
                      <h3 dir="auto">{mass.title}</h3>
                      <p>
                        {mass.liturgical_season?.name ?? 'No season selected'} ·{' '}
                        {mass.selection_count} hymns
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
          {!query.data.count && (
            <p className="notice">
              {filtered
                ? 'No Mass plans match these filters. Try another search or clear the filters.'
                : user?.role === 'Viewer'
                  ? 'No Mass plans yet. A planner can create the first draft.'
                  : 'No Mass plans yet. Create your first draft to begin planning.'}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={!query.data.previous}
              onClick={() => filter('page', String(Number(params.get('page') ?? 1) - 1))}
            >
              Previous
            </button>
            <span>Page {params.get('page') ?? 1}</span>
            <button
              className="button secondary"
              disabled={!query.data.next}
              onClick={() => filter('page', String(Number(params.get('page') ?? 1) + 1))}
            >
              Next
            </button>
          </div>
        </>
      )}
    </>
  );
}
