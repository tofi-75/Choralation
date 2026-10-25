import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { ChoirPages } from './ChoirPages';
import { clearCsrfToken } from '../api/client';
const mocks = vi.hoisted(() => ({
  role: 'Admin',
  choirRole: 'Member',
  refresh: vi.fn(async () => {}),
}));
vi.mock('../features/auth/SessionProvider', () => ({
  useSession: () => ({ user: { id: 1, role: mocks.role } }),
}));
vi.mock('../features/choirs/ChoirProvider', () => ({
  useChoir: () => ({
    active: { id: 7 },
    choirs: [
      {
        id: 7,
        name: 'Sunday Choir',
        description: '',
        is_public: false,
        member_count: 2,
        role: mocks.choirRole,
      },
    ],
    select: vi.fn(),
    refresh: mocks.refresh,
  }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  clearCsrfToken();
  mocks.role = 'Admin';
  mocks.choirRole = 'Member';
});
function mount(failed = false) {
  let pending = true;
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.includes('/hymns/review-queue/'))
      return Response.json({ count: 0, results: [], next: null, previous: null });
    if (url.includes('/csrf/')) return Response.json({ csrf_token: 'masked' });
    if (url.includes('/pending-requests/'))
      return failed
        ? Response.json({ detail: 'Unavailable', code: 'unavailable', errors: {} }, { status: 503 })
        : Response.json({
            count: pending ? 1 : 0,
            next: null,
            previous: null,
            results: pending
              ? [{ id: 5, choir_id: 7, choir_name: 'Sunday Choir', username: 'applicant' }]
              : [],
          });
    if (url.includes('/decide/')) {
      pending = false;
      return new Response(null, { status: 204 });
    }
    if (options?.method === 'POST') throw new Error('Unexpected write');
    return Response.json([]);
  });
  vi.stubGlobal('fetch', fetch);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ChoirPages mode="list" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetch;
}
it.each(['approved', 'declined'])(
  'lets an Admin review and mark a request %s directly on Choirs',
  async (status) => {
    const fetch = mount();
    const inbox = await screen.findByRole('region', { name: 'Join requests (1)' });
    expect(within(inbox).getByText('applicant')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Manage choir' })).toHaveAttribute('href', '/choirs/7');
    await userEvent.click(
      within(inbox).getByRole('button', {
        name: `${status === 'approved' ? 'Approve' : 'Decline'} applicant for Sunday Choir`,
      }),
    );
    expect(await screen.findByText('No pending join requests.')).toBeVisible();
    const decision = fetch.mock.calls.find(([url]) => url.includes('/decide/'))!;
    expect(JSON.parse(String(decision[1]?.body))).toEqual({ status });
    expect(mocks.refresh).toHaveBeenCalled();
  },
);
it('shows incoming requests to a choir planner', async () => {
  mocks.role = 'Planner';
  mocks.choirRole = 'Planner';
  mount();
  expect(await screen.findByRole('region', { name: 'Join requests (1)' })).toBeVisible();
});
it('keeps incoming requests separate from a regular member’s own applications', async () => {
  mocks.role = 'Viewer';
  mount();
  expect(await screen.findByRole('heading', { name: 'Your applications' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: /Join requests/ })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View choir' })).toHaveAttribute('href', '/choirs/7');
});
it('shows a recoverable inbox error instead of an empty-state claim', async () => {
  mount(true);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load join requests');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Refresh requests' })).toBeEnabled(),
  );
  expect(screen.queryByText('No pending join requests.')).not.toBeInTheDocument();
});
