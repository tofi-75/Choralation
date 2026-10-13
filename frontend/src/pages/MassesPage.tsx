/** Ready programs by default; URL-backed draft/search filters apply before pagination. */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { fetchMasses } from '../api/masses';
import { useSession } from '../features/auth/SessionProvider';
import { useCategories } from '../features/hymns/queries';

export function MassesPage() {
  const [params, setParams] = useSearchParams();
  // Save draft keeps the lifecycle at draft. Only explicit finalization makes
  // a program ready; never infer readiness from hymn count or archive date.
  const status = params.get('status') === 'draft' ? 'draft' : 'finalized';
  const requestParams = new URLSearchParams(params);
  requestParams.set('status', status);
  const queryString = requestParams.toString();
  const query = useQuery({
    queryKey: ['masses', queryString],
    queryFn: () => fetchMasses(queryString),
  });
  const [filtersOpen, setFiltersOpen] = useState(() =>
    ['from', 'to', 'season'].some((key) => params.has(key)),
  );
  const categories = useCategories();
  const { user } = useSession();
  const createButton = useRef<HTMLAnchorElement>(null);
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const button = createButton.current;
    if (!button) return;
    // Show as soon as any part of the action scrolls above the viewport.
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowTop(entry.boundingClientRect.top < 0);
      },
      { threshold: [0, 1] },
    );
    observer.observe(button);
    return () => observer.disconnect();
  }, [user?.role]);
  const filtered = ['q', 'from', 'to', 'season'].some((key) => params.has(key));
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
          <p className="muted">Access ready programs or continue planning your drafts.</p>
        </div>
        {user?.role !== 'Viewer' && (
          <Link ref={createButton} className="button primary" to="/masses/new">
            Create Mass
          </Link>
        )}
      </div>
      <section className="mass-list-controls" aria-label="Mass filters">
        <div className="mass-search-toolbar">
          <label className="field">
            <span className="sr-only">Search Mass plans</span>
            <input
              type="search"
              placeholder="Search titles or notes"
              aria-describedby="mass-search-help"
              value={params.get('q') ?? ''}
              onChange={(event) => filter('q', event.target.value)}
            />
          </label>
          <button
            className="button secondary mass-filter-toggle"
            aria-label="Filters"
            aria-expanded={filtersOpen}
            aria-controls="mass-list-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M4 7h16M4 17h16M8 4v6M16 14v6" />
            </svg>
          </button>
        </div>
        <p id="mass-search-help" className="sr-only">
          Search titles or notes in the selected list. Open Filters for dates or season.
        </p>
        <div className="mass-list-toggle" role="group" aria-label="Mass list">
          <button
            className="button secondary"
            aria-pressed={status === 'finalized'}
            onClick={() => filter('status', '')}
          >
            Ready Masses
          </button>
          <button
            className="button secondary"
            aria-pressed={status === 'draft'}
            onClick={() => filter('status', 'draft')}
          >
            Pending drafts
          </button>
        </div>
        <p className="tiny mass-list-description">
          {status === 'draft'
            ? 'Saved drafts awaiting finalization.'
            : 'Finalized programs ready to use.'}
        </p>
        <div id="mass-list-filters" className="mass-list-filter-panel" hidden={!filtersOpen}>
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
        </div>
        {filtered && (
          <button
            className="text-button"
            onClick={() =>
              setParams(status === 'draft' ? { status: 'draft' } : {}, { replace: true })
            }
          >
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
          <p className="muted">
            {query.data.count} {status === 'draft' ? 'pending drafts' : 'ready Masses'}
          </p>
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
                : status === 'draft'
                  ? 'No pending drafts. New drafts appear here while you prepare them.'
                  : 'No ready Masses yet. Finalize a saved draft to make it ready.'}
            </p>
          )}
          {!query.data.next && query.data.count > 0 && (
            <p className="list-end" role="status">
              {filtered ? 'End of matching Mass plans' : 'End of Mass plans'}
            </p>
          )}
          {(query.data.previous || query.data.next) && (
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
          )}
        </>
      )}
      {showTop && (
        <button
          className="button primary scroll-to-top"
          aria-label="Scroll to top"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            createButton.current?.focus({ preventScroll: true });
          }}
        >
          <span aria-hidden="true">↑</span>
        </button>
      )}
    </>
  );
}
