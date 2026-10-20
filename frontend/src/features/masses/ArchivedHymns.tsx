/** Expand one archived program on demand instead of loading every full program at once. */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { fetchMass } from '../../api/masses';
export function ArchivedHymns({ id, count }: { id: number; count: number }) {
  const [open, setOpen] = useState(false);
  const program = useQuery({
    queryKey: ['mass', String(id)],
    queryFn: () => fetchMass(String(id)),
    enabled: open,
  });
  return (
    <details className="archived-program" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Hymns ({count})</summary>
      {open && (
        <>
          {program.isPending && <p role="status">Loading hymns…</p>}
          {program.error && (
            <p role="alert">
              Unable to load hymns.{' '}
              <button className="text-button" onClick={() => void program.refetch()}>
                Try again
              </button>
            </p>
          )}
          {program.data && (
            <ul className="archive-hymns">
              {program.data.program.map((row) => (
                <li key={row.id}>
                  <span className="muted">{row.placement.name}: </span>
                  <Link to={`/hymns/${row.hymn.id}`} dir="auto">
                    {row.hymn.title}
                  </Link>
                </li>
              ))}
              {program.data.program.length === 0 && <li>Hymn not selected</li>}
            </ul>
          )}
        </>
      )}
    </details>
  );
}
