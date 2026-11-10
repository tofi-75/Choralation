import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { setChoirCreationPermission } from '../../api/auth';
import { decideManagerRequest, fetchManagerRequests } from '../../api/managerRequests';
import type { ManagerDecision } from '../../api/managerRequests';
import { useConfirmation } from '../../components/ConfirmationProvider';
import { FloatingNotice } from '../../components/FloatingNotice';

export function useManagerQueue(page: number, enabled = true) {
  return useQuery({
    queryKey: ['manager-requests', page],
    queryFn: () => fetchManagerRequests(page),
    enabled,
  });
}

type Action =
  | { type: 'decision'; id: number; status: ManagerDecision }
  | { type: 'manual'; username: string; allow: boolean };

export function ManagerRequests() {
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState('');
  const client = useQueryClient();
  const confirm = useConfirmation();
  const queue = useManagerQueue(page);
  const refresh = async () => {
    setPage(1);
    await client.invalidateQueries({ queryKey: ['manager-requests'] });
  };
  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      if (action.type === 'decision') {
        await decideManagerRequest(action.id, action.status);
        return action.status === 'approved'
          ? 'Manager access approved.'
          : 'Manager request declined.';
      }
      const result = await setChoirCreationPermission(action.username, action.allow);
      return result.detail;
    },
    onSuccess: async (message) => {
      await refresh();
      setNotice(message);
    },
    onError: refresh,
  });

  return (
    <>
      <section className="form-section" aria-labelledby="manager-requests-heading">
        <div className="section-heading">
          <h2 id="manager-requests-heading">Manager requests</h2>
          <button
            className="text-button"
            disabled={queue.isFetching || mutation.isPending}
            onClick={() => void refresh()}
          >
            Refresh requests
          </button>
        </div>
        {queue.isPending && <p role="status">Loading requests…</p>}
        {queue.error && <p role="alert">{queue.error.message}</p>}
        {queue.data && (
          <p role="status">
            {queue.data.count === 0 ? 'No pending requests.' : `${queue.data.count} pending`}
          </p>
        )}
        {Boolean(queue.data?.results.length) && (
          <ul className="choir-list">
            {queue.data?.results.map((item) => (
              <li className="member-row" key={item.id}>
                <div>
                  <strong dir="auto">{item.username}</strong>
                  <p className="tiny">
                    <time dateTime={item.requested_at}>
                      {new Date(item.requested_at).toLocaleDateString()}
                    </time>
                  </p>
                </div>
                <div className="form-actions">
                  {(['approved', 'declined'] as const).map((status) => {
                    const label = status === 'approved' ? 'Approve' : 'Decline';
                    return (
                      <button
                        key={status}
                        className={`button ${status === 'approved' ? 'primary' : 'secondary'}`}
                        aria-label={`${label} Manager request from ${item.username}`}
                        disabled={mutation.isPending}
                        onClick={async () => {
                          if (
                            await confirm(
                              `${label} the Manager request from ${item.username}?`,
                              label,
                            )
                          ) {
                            setNotice('');
                            mutation.mutate({ type: 'decision', id: item.id, status });
                          }
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
        {(page > 1 || queue.data?.next) && (
          <nav className="form-actions" aria-label="Manager request pages">
            <button
              className="button secondary"
              disabled={page === 1 || mutation.isPending}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              className="button secondary"
              disabled={!queue.data?.next || mutation.isPending}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </nav>
        )}
      </section>
      <details className="form-section">
        <summary>Manual access</summary>
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const username = String(data.get('username')).trim();
            const allow = data.has('can_create_choirs');
            if (
              !username ||
              !(await confirm(
                `${allow ? 'Grant' : 'Revoke'} Manager access for ${username}?`,
                'Update permission',
              ))
            )
              return;
            setNotice('');
            mutation.mutate({ type: 'manual', username, allow });
          }}
        >
          <label className="field">
            Username
            <input name="username" required maxLength={150} />
          </label>
          <label className="checkbox-choice">
            <input name="can_create_choirs" type="checkbox" />
            Can create choirs
          </label>
          <button className="button secondary" disabled={mutation.isPending}>
            Update permission
          </button>
        </form>
      </details>
      {notice && <FloatingNotice dismiss={() => setNotice('')}>{notice}</FloatingNotice>}
      {mutation.error && (
        <FloatingNotice error dismiss={mutation.reset}>
          {mutation.error.message}
        </FloatingNotice>
      )}
    </>
  );
}
