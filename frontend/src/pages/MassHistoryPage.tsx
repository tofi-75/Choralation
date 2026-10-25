import { useChoirQuery } from '../features/choirs/useChoirQuery';
/** Newest-first saved programs; drafts can be inspected but never count as usage. */

import { Link, useSearchParams } from 'react-router';
import { fetchMassHistory } from '../api/masses';
import { HistoryControls, HistoryPages } from '../features/masses/HistoryControls';
import { useChoir } from '../features/choirs/ChoirProvider';
import { ChoirRequired } from '../features/choirs/ChoirRequired';

export function MassHistoryPage() {
  const { active } = useChoir();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Beirut',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [params, setParams] = useSearchParams();
  const query = new URLSearchParams(params);
  if (!query.has('status')) query.set('status', 'finalized');
  if (query.get('status') === 'all') query.delete('status');
  const encoded = query.toString();
  const history = useChoirQuery({
    queryKey: ['mass-history', encoded],
    queryFn: (choirId) => fetchMassHistory(encoded, choirId),
    enabled: Boolean(active),
  });
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  if (!active) return <ChoirRequired />;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1 className="page-title">Mass history</h1>
          <p className="muted">
            Finalized programs, newest first. Drafts never count toward hymn usage.
          </p>
        </div>
        <Link className="button secondary" to="/masses">
          Mass plans
        </Link>
      </div>
      <section className="form-section" aria-label="Filter Mass history">
        <HistoryControls params={params} change={change} status />
        {params.size > 0 && (
          <button className="text-button" onClick={() => setParams({})}>
            Reset history filters
          </button>
        )}
      </section>
      {history.isPending && <p role="status">Loading Mass history…</p>}
      {history.error && (
        <p className="notice error" role="alert">
          {history.error.message}{' '}
          <button className="button secondary" onClick={() => void history.refetch()}>
            Try again
          </button>
        </p>
      )}
      {history.data && (
        <>
          <p className="muted">
            {history.data.count} saved {history.data.count === 1 ? 'program' : 'programs'}
          </p>
          {history.data.count === 0 && (
            <p className="notice">
              No programs match. Finalize a saved draft to see it here, or adjust the history
              filters.
            </p>
          )}
          <div className="mass-list">
            {history.data.results.map((mass) => (
              <article className="mass-card history-card" key={mass.id}>
                <p className="tiny muted">
                  {mass.date} · {mass.status}
                  {mass.status === 'finalized' &&
                    (mass.date > today ? ' · Scheduled' : mass.date === today ? ' · Today' : '')}
                </p>
                <h2>
                  <Link to={`/masses/${mass.id}`} dir="auto">
                    {mass.title}
                  </Link>
                </h2>
                <p className="tiny">
                  {mass.liturgical_season?.name ?? 'No season'} · {mass.selection_count} selections
                </p>
                {mass.notes && (
                  <p className="tiny history-note" dir="auto">
                    {mass.notes}
                  </p>
                )}
                <ul className="tiny">
                  {mass.preview.map((row) => (
                    <li key={row.id} dir="auto">
                      {row.placement.name}: {row.hymn.title}
                    </li>
                  ))}
                </ul>
                {mass.selection_count > mass.preview.length && (
                  <p className="tiny muted">
                    + {mass.selection_count - mass.preview.length} more in saved program
                  </p>
                )}
              </article>
            ))}
          </div>
          <HistoryPages {...history.data} page={params.get('page') ?? '1'} change={change} />
        </>
      )}
    </>
  );
}
