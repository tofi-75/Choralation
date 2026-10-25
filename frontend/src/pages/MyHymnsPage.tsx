import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { fetchMyHymns } from '../api/library';

export function MyHymnsPage() {
  const [page, setPage] = useState(1);
  const hymns = useQuery({
    queryKey: ['hymn-submissions', 'mine', page],
    queryFn: () => fetchMyHymns(page),
  });
  return (
    <>
      <Link className="text-button" to="/hymns">
        ← Shared hymn library
      </Link>
      <div className="page-heading">
        <h1>My hymns</h1>
        <Link className="button primary" to="/hymns/new">
          Add hymn
        </Link>
      </div>
      <p className="muted">
        Private hymns stay in your account. Request a choir planner’s approval to share them with
        all signed-in users.
      </p>
      {hymns.isPending && <p role="status">Loading your hymns…</p>}
      {hymns.error && (
        <div role="alert">
          <p>Unable to load your hymns.</p>
          <button className="button secondary" onClick={() => void hymns.refetch()}>
            Retry
          </button>
        </div>
      )}
      {hymns.data?.count === 0 && <p>No hymns added yet.</p>}
      <ul className="choir-list">
        {hymns.data?.results.map((hymn) => (
          <li className="member-row" key={hymn.id}>
            <span>
              <Link to={`/hymns/${hymn.id}`} dir="auto">
                <strong>{hymn.title}</strong>
              </Link>
              <br />
              <small className="muted">
                {hymn.language.name} ·{' '}
                {hymn.publication_status === 'pending'
                  ? 'Awaiting planner approval'
                  : hymn.publication_status === 'declined'
                    ? 'Changes requested'
                    : hymn.publication_status === 'private'
                      ? 'Private'
                      : 'Published'}
                {hymn.submission?.choir_name ? ` · ${hymn.submission.choir_name}` : ''}
              </small>
            </span>
            <Link className="button secondary" to={`/hymns/${hymn.id}`}>
              View hymn
            </Link>
          </li>
        ))}
      </ul>
      {(page > 1 || hymns.data?.next) && (
        <nav className="form-actions" aria-label="My hymn pages">
          <button
            className="button secondary"
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button
            className="button secondary"
            disabled={!hymns.data?.next}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </>
  );
}
