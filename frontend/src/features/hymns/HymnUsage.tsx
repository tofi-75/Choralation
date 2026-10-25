import { useChoirQuery } from '../choirs/useChoirQuery';
/** Every finalized occurrence remains visible, including repeats and inactive sections. */

import { useState } from 'react';
import { Link } from 'react-router';
import { fetchHymnUsage } from '../../api/masses';
import { HistoryControls, HistoryPages } from '../masses/HistoryControls';
import { useChoir } from '../choirs/ChoirProvider';

export function HymnUsage({ id }: { id: number }) {
  const { active } = useChoir();
  const [params, setParams] = useState(new URLSearchParams());
  const encoded = params.toString();
  const history = useChoirQuery({
    queryKey: ['hymn-usage', id, encoded],
    queryFn: (choirId) => fetchHymnUsage(id, encoded, choirId),
    enabled: Boolean(active),
  });
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  if (!active) return null;
  return (
    <section className="detail-section" aria-label="Hymn usage history">
      <h2>Usage in {active.name}</h2>
      <p className="tiny muted">
        Finalized selections only, including scheduled programs. Repeated selections appear
        separately.
      </p>
      <HistoryControls params={params} change={change} />
      {params.size > 0 && (
        <button className="text-button" onClick={() => setParams(new URLSearchParams())}>
          Reset usage filters
        </button>
      )}
      {history.isPending && <p role="status">Loading usage…</p>}
      {history.error && (
        <p role="alert">
          {history.error.message}{' '}
          <button className="button secondary" onClick={() => void history.refetch()}>
            Retry usage
          </button>
        </p>
      )}
      {history.data && (
        <>
          {history.data.count === 0 && <p>No finalized selections match these filters.</p>}
          <ol className="usage-history">
            {history.data.results.map((row) => (
              <li key={row.selection_id}>
                <Link to={`/masses/${row.mass.id}`} dir="auto">
                  {row.mass.title}
                </Link>
                <p className="tiny muted">
                  {row.mass.date} · {row.placement.name}
                  {!row.placement.is_active && ' (inactive)'} · Hymn {row.position + 1}
                </p>
                {row.notes && (
                  <p className="tiny preserve-lines" dir="auto">
                    {row.notes}
                  </p>
                )}
              </li>
            ))}
          </ol>
          <HistoryPages {...history.data} page={params.get('page') ?? '1'} change={change} />
        </>
      )}
    </section>
  );
}
