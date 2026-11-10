import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMyManagerRequest, submitManagerRequest } from '../../api/managerRequests';
import { useSession } from './SessionProvider';

export function ManagerAccessPanel() {
  const { user } = useSession();
  const client = useQueryClient();
  const queryKey = ['my-manager-request', user?.id] as const;
  const access = useQuery({ queryKey, queryFn: fetchMyManagerRequest });
  const canCreate = access.data?.can_create_choirs;
  useEffect(() => {
    if (canCreate !== undefined && canCreate !== user?.can_create_choirs) {
      void client.invalidateQueries({ queryKey: ['session'], exact: true });
    }
  }, [canCreate, user?.can_create_choirs, client]);

  const submission = useMutation({
    mutationFn: submitManagerRequest,
    onSuccess: (result) => client.setQueryData(queryKey, result),
    onError: () => access.refetch(),
  });
  const status = access.data?.request?.status;
  const canRequest = access.isSuccess && !canCreate && status !== 'pending';
  return (
    <section className="form-section" aria-labelledby="manager-access-heading">
      <div className="section-heading">
        <h2 id="manager-access-heading">Manager access</h2>
        <button
          className="text-button"
          disabled={access.isFetching || submission.isPending}
          onClick={() => void access.refetch()}
        >
          Refresh status
        </button>
      </div>
      <p>Managers can create choirs and plan Masses for the choirs they create.</p>
      {access.isPending && <p role="status">Checking Manager access…</p>}
      {access.error && <p role="alert">{access.error.message}</p>}
      {submission.error && <p role="alert">{submission.error.message}</p>}
      {canCreate && <p role="status">You have Manager access.</p>}
      {!canCreate && status === 'pending' && (
        <p role="status">Your request is pending Admin review.</p>
      )}
      {!canCreate && status === 'declined' && (
        <p role="status">Your previous request was declined.</p>
      )}
      {canRequest && (
        <button
          className="button primary"
          disabled={submission.isPending || access.isFetching}
          onClick={() => submission.mutate()}
        >
          {submission.isPending ? 'Submitting…' : 'Request Manager access'}
        </button>
      )}
    </section>
  );
}
