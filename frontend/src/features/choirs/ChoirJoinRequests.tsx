import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { fetchPendingRequests } from '../../api/choirs';

export function ChoirJoinRequests({
  pending,
  onDecision,
}: {
  pending: boolean;
  onDecision: (choir: number, id: number, status: 'approved' | 'declined') => Promise<void>;
}) {
  const [page, setPage] = useState(1);
  const requests = useQuery({
    queryKey: ['choir-join-requests', page],
    queryFn: () => fetchPendingRequests(page),
    refetchInterval: 60_000,
  });
  return (
    <section className="detail-section" aria-labelledby="join-requests-heading">
      <div className="section-heading">
        <h2 id="join-requests-heading">
          Join requests{requests.data ? ` (${requests.data.count})` : ''}
        </h2>
        <button
          className="text-button"
          disabled={pending || requests.isFetching}
          onClick={() => void requests.refetch()}
        >
          Refresh requests
        </button>
      </div>
      {requests.isPending && <p role="status">Loading join requests…</p>}
      {requests.error && (
        <p role="alert">Unable to load join requests. Please refresh or try again.</p>
      )}
      {requests.data?.count === 0 && <p className="muted">No pending join requests.</p>}
      <ul className="choir-list">
        {requests.data?.results.map((request) => (
          <li className="member-row" key={request.id}>
            <span>
              <strong>{request.username}</strong>
              <br />
              <Link to={`/choirs/${request.choir_id}`}>{request.choir_name}</Link>
            </span>
            <div className="form-actions">
              {(['approved', 'declined'] as const).map((status) => (
                <button
                  key={status}
                  className={`button ${status === 'approved' ? 'primary' : 'secondary'}`}
                  disabled={pending}
                  aria-label={`${status === 'approved' ? 'Approve' : 'Decline'} ${request.username} for ${request.choir_name}`}
                  onClick={() => {
                    void onDecision(request.choir_id, request.id, status).then(() => setPage(1));
                  }}
                >
                  {status === 'approved' ? 'Approve' : 'Decline'}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {(page > 1 || requests.data?.next) && (
        <nav className="form-actions" aria-label="Join request pages">
          <button
            className="button secondary"
            disabled={page === 1 || pending}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button
            className="button secondary"
            disabled={!requests.data?.next || pending}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
