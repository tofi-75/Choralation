import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { fetchHymnReviews } from '../../api/library';

export function HymnReviewQueue({ choirId }: { choirId?: number }) {
  const heading = useId();
  const [page, setPage] = useState(1);
  const reviews = useQuery({
    queryKey: ['hymn-submissions', 'review', choirId, page],
    queryFn: () => fetchHymnReviews(page, choirId),
    refetchInterval: 60000,
  });
  return (
    <section className="detail-section" aria-labelledby={heading}>
      <div className="section-heading">
        <h2 id={heading}>Hymn submissions{reviews.data ? ` (${reviews.data.count})` : ''}</h2>
        <button
          className="text-button"
          disabled={reviews.isFetching}
          onClick={() => void reviews.refetch()}
        >
          Refresh submissions
        </button>
      </div>
      {reviews.isPending && <p role="status">Loading hymn submissions…</p>}
      {reviews.error && (
        <p role="alert">Unable to load hymn submissions. Please refresh and try again.</p>
      )}
      {reviews.data?.count === 0 && <p className="muted">No hymns awaiting approval.</p>}
      <ul className="choir-list">
        {reviews.data?.results.map((hymn) => (
          <li className="member-row" key={hymn.id}>
            <span>
              <strong dir="auto">{hymn.title}</strong>
              <br />
              <small>
                {hymn.submission?.submitted_by} · {hymn.submission?.choir_name}
              </small>
            </span>
            <Link className="button secondary" to={`/hymns/${hymn.id}`}>
              Review hymn
            </Link>
          </li>
        ))}
      </ul>
      {(page > 1 || reviews.data?.next) && (
        <nav className="form-actions" aria-label="Hymn review pages">
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
            disabled={!reviews.data?.next}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
