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
it('defaults to finalized programs and opens compact filters on demand', async () => {
  mount();
  await waitFor(() => expect(fetchMasses).toHaveBeenCalledWith('status=finalized'));
  expect(screen.getByRole('button', { name: 'Ready Masses' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByLabelText('From date')).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  expect(screen.getByLabelText('From date')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Filters' })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  expect(screen.getByLabelText('From date')).not.toBeVisible();
});
it('switches lifecycle with retained search/date filters and resets pagination', async () => {
  mount('/masses?q=Choir&from=2026-10-01&page=3');
  fireEvent.click(screen.getByRole('button', { name: 'Pending drafts' }));
  await waitFor(() =>
    expect(fetchMasses).toHaveBeenLastCalledWith('q=Choir&from=2026-10-01&status=draft'),
  );
  expect(screen.getByRole('button', { name: 'Pending drafts' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(fetchMasses).toHaveBeenLastCalledWith('status=draft'));
  expect(screen.getByLabelText('URL')).toHaveTextContent('?status=draft');
  expect(screen.getByLabelText('Search Mass plans')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Ready Masses' }));
  await waitFor(() => expect(fetchMasses).toHaveBeenLastCalledWith('status=finalized'));
  expect(screen.getByLabelText('URL')).toBeEmptyDOMElement();
});
it('restores a draft deep link and does not treat lifecycle choice as a search filter', async () => {
  mount('/masses?status=draft');
  await waitFor(() => expect(fetchMasses).toHaveBeenCalledWith('status=draft'));
  expect(await screen.findByText('No pending drafts.', { exact: false })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pending drafts' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
