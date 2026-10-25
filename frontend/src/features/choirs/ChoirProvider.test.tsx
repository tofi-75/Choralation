import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { clearCsrfToken, request, choirHeaders } from '../../api/client';
import { ChoirProvider, useChoir } from './ChoirProvider';
import { useChoirQuery } from './useChoirQuery';

vi.mock('../auth/SessionProvider', () => ({
  useSession: () => ({ user: { id: 812, role: 'Viewer' } }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  clearCsrfToken();
});
const choirs = [1, 2].map((id) => ({
  id,
  name: `Choir ${id}`,
  description: '',
  is_public: false,
  show_member_count: true,
  member_count: 1,
  role: 'Member',
}));
function Reader() {
  const { active, select } = useChoir();
  const query = useChoirQuery({
    queryKey: ['probe'],
    queryFn: (choirId) =>
      request('/hymns/1/', z.object({ usage_count: z.number() }), choirHeaders(choirId)),
  });
  return (
    <>
      <p>{active?.name}</p>
      <p>Count {query.data?.usage_count ?? 'loading'}</p>
      <button onClick={() => void select(2)}>Switch choir</button>
    </>
  );
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ChoirProvider>
          <Reader />
        </ChoirProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
it('scopes count requests and cache keys, clears the prior choir, and respects unsaved work', async () => {
  const headers: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith('/choirs/')) return Response.json(choirs);
      const choir = new Headers(options.headers).get('X-Choir-ID') ?? '';
      headers.push(choir);
      return Response.json({ usage_count: choir === '1' ? 2 : 7 });
    }),
  );
  const client = mount();
  expect(await screen.findByText('Count 2')).toBeVisible();
  const block = (event: Event) => event.preventDefault();
  window.addEventListener('choralation:before-signout', block);
  await userEvent.click(screen.getByRole('button', { name: 'Switch choir' }));
  expect(screen.getByText('Choir 1')).toBeVisible();
  expect(headers).not.toContain('2');
  window.removeEventListener('choralation:before-signout', block);
  await userEvent.click(screen.getByRole('button', { name: 'Switch choir' }));
  expect(await screen.findByText('Count 7')).toBeVisible();
  expect(client.getQueryData(['probe', 1])).toBeUndefined();
  expect(client.getQueryData(['probe', 2])).toEqual({ usage_count: 7 });
  expect(headers).toContain('2');
});
it('offers retry when the initial choir request fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(Response.json(choirs)),
  );
  mount();
  expect(await screen.findByRole('button', { name: 'Retry choirs' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Retry choirs' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Retry choirs' })).not.toBeInTheDocument(),
  );
});
