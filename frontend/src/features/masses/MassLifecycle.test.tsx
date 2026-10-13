/** Review binds the saved revision, handles stale confirms, and refreshes usage caches. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { clearCsrfToken } from '../../api/client';
import { SessionProvider } from '../auth/SessionProvider';
import { mass } from './fixtures.test-support';
import { MassLifecycle } from './MassLifecycle';

afterEach(() => {
  vi.unstubAllGlobals();
  clearCsrfToken();
});
function mount(conflict = false, role = 'Planner', finalized = false, held?: Promise<void>) {
  const writes: RequestInit[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/me/')) return Response.json({ id: 1, username: 'planner', role });
      if (url.endsWith('/csrf/')) return Response.json({ csrf_token: 'masked' });
      writes.push(options!);
      if (held) await held;
      return conflict
        ? Response.json(
            { detail: 'Stale', code: 'revision_conflict', errors: { current_revision: 2 } },
            { status: 412 },
          )
        : Response.json({
            ...mass,
            status: finalized ? 'draft' : 'finalized',
            revision: 2,
            finalized_at: finalized ? null : '2026-10-08T00:00:00Z',
          });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <MassLifecycle
          mass={{ ...mass, status: finalized ? 'finalized' : 'draft' }}
          unavailable={false}
        />
      </SessionProvider>
    </QueryClientProvider>,
  );
  return { writes, invalidate };
}
it('finalizes an empty saved program once with an inline notice and refreshes affected caches', async () => {
  const { writes, invalidate } = mount();
  const user = userEvent.setup();
  const button = await screen.findByRole('button', { name: 'Finalize Mass' });
  expect(button).toHaveAccessibleDescription(
    'Finalizing makes this program read-only and adds each hymn selection to usage counts.',
  );
  expect(writes).toHaveLength(0);
  await user.click(button);
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['hymn-usage'] }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(writes).toHaveLength(1);
  expect(new Headers(writes[0].headers).get('X-Expected-Mass-Revision')).toBe('1');
  expect(writes[0].body).toBe('{}');
  for (const key of ['mass', 'masses', 'mass-history', 'hymns', 'hymn', 'hymn-usage'])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
});
it('blocks a stale finalization until the refreshed program is explicitly acknowledged', async () => {
  const { writes } = mount(true);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Finalize Mass' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This Mass changed.');
  expect(screen.getByRole('button', { name: 'Finalize Mass' })).toBeDisabled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(writes).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: "I've reviewed the refreshed program" }));
  expect(screen.getByRole('button', { name: 'Finalize Mass' })).toBeEnabled();
  expect(writes).toHaveLength(1);
});
it('prevents repeated submission while finalization is pending', async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { writes } = mount(false, 'Planner', false, held);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Finalize Mass' }));
  const busy = await screen.findByRole('button', { name: 'Working…' });
  expect(busy).toBeDisabled();
  await user.click(busy);
  expect(writes).toHaveLength(1);
  release();
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Working…' })).not.toBeInTheDocument(),
  );
});
it('offers reopening only to an Admin with an explicit impact confirmation', async () => {
  mount(false, 'Admin', true);
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Reopen draft' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('removes this program from hymn usage');
});
