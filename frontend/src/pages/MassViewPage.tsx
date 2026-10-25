import { useChoirQuery } from '../features/choirs/useChoirQuery';
/** Saved programs open as compact read-only views; editing is an explicit route. */

import { Link, useParams } from 'react-router';

import { fetchMass } from '../api/masses';
import { fetchMassPlacements } from '../api/library';
import { MassFocusMode } from '../features/masses/MassFocusMode';
import { MassLifecycle } from '../features/masses/MassLifecycle';
import { useChoir } from '../features/choirs/ChoirProvider';

export function MassViewPage() {
  const choir = useChoir();
  const { id } = useParams();
  const query = useChoirQuery({
    queryKey: ['mass', id],
    queryFn: (choirId) => fetchMass(id!, choirId),
  });
  const sections = useChoirQuery({
    queryKey: ['categories', 'mass-placements'],
    queryFn: fetchMassPlacements,
  });
  const retry = () => {
    void query.refetch();
    void sections.refetch();
  };
  // The editor and view share a cache. Wait for a fresh saved read when entering
  // the view, rather than briefly displaying a cached pre-save program.
  if (query.isPending || sections.isPending || (query.isFetching && !query.isFetchedAfterMount))
    return <p role="status">Loading saved Mass plan…</p>;
  if (!query.data || !sections.data)
    return (
      <section role="alert">
        <h1>Unable to load saved Mass plan</h1>
        <p>{query.error?.message ?? sections.error?.message}</p>
        <button className="button secondary" onClick={retry}>
          Try again
        </button>
        <Link to="/masses">Return to Mass plans</Link>
      </section>
    );
  const mass = query.data;
  if (choir.active?.id !== mass.choir_id)
    return (
      <section className="form-section">
        <p>This Mass belongs to another choir you can access.</p>
        <button
          className="button primary"
          onClick={() => void choir.select(mass.choir_id, `/masses/${id}`)}
        >
          Open this choir
        </button>
      </section>
    );
  const selected = new Set(mass.program.map((row) => row.placement.id));
  // Configuration supplies empty sections. Merge saved references so selected
  // inactive sections remain readable, then follow configured display order.
  const placements = [
    ...new Map([
      ...mass.program.map((row) => [row.placement.id, row.placement] as const),
      ...sections.data.map((row) => [row.id, row] as const),
    ]).values(),
  ]
    .filter((row) => row.is_active || selected.has(row.id))
    .sort((left, right) => left.display_order - right.display_order || left.id - right.id);
  const date = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${mass.date}T12:00:00Z`),
  );
  return (
    <article className="mass-view">
      <Link className="text-button" to="/masses">
        ← Mass plans
      </Link>
      <div className="page-heading saved-mass-heading">
        <div>
          <p className="eyebrow">
            {mass.status === 'draft' ? 'Saved draft' : 'Finalized Mass program'}
          </p>
          <h1 className="page-title" dir="auto">
            {mass.title}
          </h1>
          <p className="tiny muted">
            <time dateTime={mass.date}>{date}</time> ·{' '}
            {mass.liturgical_season?.name ?? 'No season selected'} · {mass.program.length}{' '}
            {mass.program.length === 1 ? 'hymn' : 'hymns'}
          </p>
        </div>
        <div className="saved-mass-actions">
          <MassFocusMode
            selections={placements.flatMap((placement) =>
              mass.program
                .filter((row) => row.placement.id === placement.id)
                .sort((a, b) => a.position - b.position),
            )}
          />
          <MassLifecycle mass={mass} unavailable={query.isFetching || Boolean(query.error)} />
        </div>
      </div>
      {(query.error || sections.error) && (
        <p className="notice error" role="alert">
          Unable to refresh this saved plan.{' '}
          <button className="text-button" onClick={retry}>
            Try again
          </button>
        </p>
      )}
      {mass.notes && (
        <p className="mass-view-notes preserve-lines" dir="auto">
          {mass.notes}
        </p>
      )}
      <div className="saved-program" aria-label="Saved hymn program" role="region">
        {placements.map((placement) => (
          <section className="saved-placement" aria-label={placement.name} key={placement.id}>
            <h2 dir="auto">
              {placement.name}
              {!placement.is_active && ' (inactive)'}
            </h2>
            {selected.has(placement.id) ? (
              <ol>
                {mass.program
                  .filter((row) => row.placement.id === placement.id)
                  .map((row) => (
                    <li key={row.id}>
                      <Link to={`/hymns/${row.hymn.id}`} dir="auto">
                        {row.hymn.title}
                      </Link>
                      <span className="tiny muted">
                        {' '}
                        · {row.hymn.language.name}
                        {!row.hymn.is_active && ' · Inactive hymn retained'}
                      </span>
                      {row.notes && (
                        <p className="tiny preserve-lines" dir="auto">
                          {row.notes}
                        </p>
                      )}
                    </li>
                  ))}
              </ol>
            ) : (
              <p className="tiny muted">Hymn not selected</p>
            )}
          </section>
        ))}
        {placements.length === 0 && <p>No Mass sections available.</p>}
      </div>
      {mass.warnings.length > 0 && (
        <details className="notice saved-program-notes">
          <summary>Program notes ({mass.warnings.length})</summary>
          <ul>
            {mass.warnings.map((warning, index) => {
              const row = mass.program.find(
                (item) =>
                  item.hymn.id === warning.hymn_id &&
                  (!warning.placement_id || item.placement.id === warning.placement_id),
              );
              return (
                <li key={index}>
                  <strong dir="auto">{row?.hymn.title ?? 'Selected hymn'}</strong>
                  {warning.code === 'duplicate_hymn'
                    ? ' appears more than once.'
                    : warning.code === 'season_mismatch'
                      ? ` is not classified for ${mass.liturgical_season?.name ?? 'this season'}.`
                      : warning.code === 'placement_mismatch'
                        ? ` is not classified for ${row?.placement.name ?? 'its placement'}.`
                        : ' is retained with an inactive hymn or placement.'}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </article>
  );
}
