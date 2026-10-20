import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { fetchMasses } from '../api/masses';
import { fetchHymns } from '../api/library';
import { hymn, mass } from '../features/masses/fixtures.test-support';
import { WorkspacePage } from './WorkspacePage';
vi.mock('../api/masses', () => ({ fetchMasses: vi.fn() }));
vi.mock('../api/library', () => ({ fetchHymns: vi.fn() }));
const session = vi.hoisted(() => ({ user: { role: 'Planner' } }));
vi.mock('../features/auth/SessionProvider', () => ({ useSession: () => session }));
beforeEach(() => {
  session.user.role = 'Planner';
  vi.mocked(fetchMasses).mockResolvedValue({
    count: 5,
    next: null,
    previous: null,
    results: Array.from({ length: 5 }, (_, index) => ({
      ...mass,
      id: index + 1,
      title: `Upcoming ${index + 1}`,
      status: 'finalized',
      is_archived: false,
    })),
  });
  vi.mocked(fetchHymns).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [hymn],
  });
});
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <WorkspacePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('shows the next four saved Masses, new hymns, navigation and practice', async () => {
  mount();
  await screen.findByRole('link', { name: /Upcoming 1/ });
  expect(fetchMasses).toHaveBeenCalledWith('status=finalized&archived=false');
  expect(fetchHymns).toHaveBeenCalledWith('ordering=newest_added');
  const upcoming = screen.getByRole('region', { name: 'Upcoming Masses' });
  expect(within(upcoming).getAllByRole('link')).toHaveLength(4);
  expect(within(upcoming).getAllByRole('link')[0]).toHaveAttribute('href', '/masses/1');
  expect(screen.queryByText('Upcoming 5')).not.toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'First hymn' })).toHaveAttribute(
    'href',
    '/hymns/1',
  );
  expect(screen.getByRole('link', { name: 'Drafts' })).toHaveAttribute(
    'href',
    '/masses?status=draft',
  );
  expect(screen.getByRole('link', { name: 'All Masses' })).toHaveAttribute('href', '/masses');
  expect(screen.getByRole('link', { name: 'Add hymn' })).toHaveAttribute('href', '/hymns/new');
  expect(screen.getByRole('region', { name: 'Practice' })).toHaveTextContent('Coming soon');
});
it('handles an empty program list and keeps hymn creation hidden for viewers', async () => {
  session.user.role = 'Viewer';
  vi.mocked(fetchMasses).mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  mount();
  await waitFor(() => expect(screen.getByText(/No upcoming saved Masses/)).toBeVisible());
  expect(screen.queryByRole('link', { name: 'Add hymn' })).not.toBeInTheDocument();
});
