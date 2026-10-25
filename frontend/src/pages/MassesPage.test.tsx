/** Lifecycle filtering happens on the server before pagination, including reloads. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { fetchMasses } from '../api/masses';
import { MassesPage } from './MassesPage';
vi.mock('../api/masses', () => ({ fetchMasses: vi.fn() }));
vi.mock('../features/auth/SessionProvider', () => ({
  useSession: () => ({ user: { role: 'Planner' } }),
}));
vi.mock('../features/hymns/queries', () => ({
  useCategories: () => ({ data: { 'liturgical-seasons': [] } }),
}));
beforeEach(() => {
  vi.mocked(fetchMasses)
    .mockReset()
    .mockResolvedValue({ count: 0, results: [], next: null, previous: null });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
function Location() {
  return <output aria-label="URL">{useLocation().search}</output>;
}
function mount(url = '/masses') {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[url]}>
        <MassesPage />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('shows upcoming saved programs by default with separate drafts and archives links', async () => {
  mount();
  await waitFor(() =>
    expect(fetchMasses).toHaveBeenCalledWith('status=finalized&archived=false', 1),
  );
  expect(screen.getByRole('link', { name: 'Drafts' })).toHaveAttribute(
    'href',
    '/masses?status=draft',
  );
  expect(screen.getByRole('link', { name: 'Archived Masses' })).toHaveAttribute(
    'href',
    '/masses?archived=true',
  );
  expect(screen.getByLabelText('From date')).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  expect(screen.getByLabelText('From date')).toBeVisible();
});
it('restores a draft deep link and retains that list when clearing search filters', async () => {
  mount('/masses?status=draft&q=Choir');
  await waitFor(() => expect(fetchMasses).toHaveBeenCalledWith('status=draft&q=Choir', 1));
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(fetchMasses).toHaveBeenLastCalledWith('status=draft', 1));
  expect(screen.getByLabelText('URL')).toHaveTextContent('?status=draft');
  expect(screen.getByRole('link', { name: 'Saved Masses' })).toHaveAttribute('href', '/masses');
});
it('requests only past saved programs for the archive', async () => {
  mount('/masses?archived=true');
  await waitFor(() =>
    expect(fetchMasses).toHaveBeenCalledWith('archived=true&status=finalized', 1),
  );
  expect(screen.getByRole('heading', { name: 'Archived Masses' })).toBeVisible();
});

vi.mock('../features/choirs/ChoirProvider', () => ({
  useChoir: () => ({
    active: { id: 1, name: 'Test choir', role: 'Planner' },
    choirs: [],
    select: async () => {},
    refresh: async () => {},
  }),
}));
