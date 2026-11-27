import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOperations } from '../api/operations';
import { setEditingPaused, useEditingPaused } from '../api/maintenance';

export function useOperations() {
  return useQuery({
    queryKey: ['operations'],
    queryFn: getOperations,
    retry: false,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function MaintenanceBanner() {
  const query = useOperations();
  const paused = useEditingPaused();
  const wasPaused = useRef(false);
  const [resumed, setResumed] = useState(false);
  useEffect(() => {
    if (query.data) {
      setEditingPaused(query.data.read_only);
    }
  }, [query.data]);
  useEffect(() => {
    if (wasPaused.current && !paused) setResumed(true);
    wasPaused.current = paused;
  }, [paused]);
  useEffect(() => () => setEditingPaused(false), []);
  if (!paused && !resumed) return null;
  return (
    <aside className="notice maintenance-banner" role="status" aria-live="polite">
      <p>
        {paused
          ? 'Editing is temporarily paused for a backup or update. You can keep reading. Your unsaved changes stay on this page.'
          : 'Editing is available again. Retry any unsaved changes when you are ready.'}
      </p>
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          if (paused) void query.refetch();
          else setResumed(false);
        }}
      >
        {paused ? 'Check again' : 'Close message'}
      </button>
    </aside>
  );
}

/** Disabled fieldsets retain controlled values and avoid remounting working copies. */
export function MaintenanceEditor({ children }: { children: ReactNode }) {
  const paused = useEditingPaused();
  return (
    <fieldset className="maintenance-editor" disabled={paused}>
      {children}
    </fieldset>
  );
}

export function OperationsPanel() {
  const query = useOperations();
  const admin = query.data?.admin;
  return (
    <section className="form-section" aria-label="Backup and deployment status">
      <h2>Backups and deployments</h2>
      {query.isPending && <p role="status">Checking operations…</p>}
      {query.error && <p role="alert">Unable to check status. {query.error.message}</p>}
      {query.data && (
        <>
          <p>
            {query.data.enabled
              ? query.data.read_only
                ? 'Editing is paused.'
                : 'Editing is available.'
              : 'Backup write protection has not been enabled. Complete the attended setup before enabling automatic deployments.'}
          </p>
          {admin && (
            <>
              <p>Operation: {admin.phase}</p>
              {admin.operation_id && (
                <p>
                  Recovery reference: <code>{admin.operation_id}</code>
                </p>
              )}
              <p className={admin.backup_stale ? 'notice error' : undefined}>
                {admin.backup_age_seconds === null
                  ? 'No verified backup recorded.'
                  : `Last verified backup: ${Math.floor(admin.backup_age_seconds / 3600)} hours ago.${admin.backup_stale ? ' Backup is overdue.' : ''}`}
              </p>
              {(['last_backup', 'last_release', 'last_restore'] as const).map((key) => (
                <div key={key}>
                  <h3>
                    {key === 'last_backup'
                      ? 'Backup'
                      : key === 'last_release'
                        ? 'Release'
                        : 'Restore test'}
                  </h3>
                  {Object.keys(admin[key]).length ? (
                    <dl>
                      {Object.entries(admin[key]).map(([label, value]) => (
                        <div key={label}>
                          <dt>{label.replaceAll('_', ' ')}</dt>
                          <dd>{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p>No result recorded.</p>
                  )}
                </div>
              ))}
            </>
          )}
        </>
      )}
      <button className="button secondary" onClick={() => void query.refetch()}>
        Refresh status
      </button>
    </section>
  );
}
