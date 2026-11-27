import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { clearCsrfToken, request } from '../api/client';
import { isEditingPaused, setEditingPaused } from '../api/maintenance';
import { MaintenanceBanner, MaintenanceEditor, OperationsPanel } from './Maintenance';

afterEach(() => {
  setEditingPaused(false);
  clearCsrfToken();
  vi.unstubAllGlobals();
});

function mount(children: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      {children}
    </QueryClientProvider>,
  );
}

it('retains editor input through maintenance and lets the user resume without reload', async () => {
  let paused = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        enabled: true,
        read_only: paused,
        reason: paused ? 'Backup' : '',
        started_at: null,
      }),
    ),
  );
  mount(
    <>
      <MaintenanceBanner />
      <MaintenanceEditor>
        <input aria-label="Unsaved hymn" defaultValue="My unsaved hymn" />
        <button>Save hymn</button>
      </MaintenanceEditor>
    </>,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save hymn' })).toBeDisabled());
  expect(screen.getByRole('textbox')).toHaveValue('My unsaved hymn');
  paused = false;
  fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save hymn' })).toBeEnabled());
  expect(screen.getByRole('textbox')).toHaveValue('My unsaved hymn');
  expect(screen.getByRole('status')).toHaveTextContent('Editing is available again');
});

it('stops writes after a maintenance response without expiring the account', async () => {
  const expired = vi.fn();
  window.addEventListener('choralation:session-expired', expired);
  const fetcher = vi.fn(async (url: string) =>
    url.endsWith('/csrf/')
      ? Response.json({ csrf_token: 'masked' })
      : Response.json(
          { detail: 'Editing paused', code: 'maintenance_read_only', errors: {} },
          { status: 503 },
        ),
  );
  vi.stubGlobal('fetch', fetcher);
  try {
    await expect(
      request('/hymns/', z.unknown(), { method: 'POST', body: '{}' }),
    ).rejects.toMatchObject({ code: 'maintenance_read_only' });
    expect(isEditingPaused()).toBe(true);
    const calls = fetcher.mock.calls.length;
    await expect(
      request('/hymns/', z.unknown(), { method: 'POST', body: '{}' }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(calls);
    expect(expired).not.toHaveBeenCalled();
    await act(async () => {
      setEditingPaused(false);
    });
  } finally {
    window.removeEventListener('choralation:session-expired', expired);
  }
});

it('reports overdue backups and unresolved operations in Admin settings', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        enabled: true,
        read_only: true,
        reason: 'Update',
        started_at: null,
        admin: {
          phase: 'deploy_requested',
          operation_id: 'release-reference',
          backup_age_seconds: 90000,
          backup_stale: true,
          last_backup: { id: 'previous-good' },
          last_release: {},
          last_restore: {},
        },
      }),
    ),
  );
  mount(<OperationsPanel />);
  expect(await screen.findByText(/Backup is overdue/)).toBeVisible();
  expect(screen.getByText('release-reference')).toBeVisible();
  expect(screen.getByText('previous-good')).toBeVisible();
});
