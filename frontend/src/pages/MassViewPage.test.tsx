/** Saved views expose reading and deliberate edit navigation, without editor fields. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { SessionProvider } from '../features/auth/SessionProvider';
import { category, hymn, mass } from '../features/masses/fixtures.test-support';
import { MassViewPage } from './MassViewPage';

afterEach(() => vi.unstubAllGlobals());
const entrance = { ...category, id: 2, name: 'Entrance', display_order: 0 };
const inactive = {
  ...category,
  id: 3,
  name: 'Retired section',
  is_active: false,
  display_order: 2,
};
function mount(
  role = 'Planner',
  status: 'draft' | 'finalized' = 'draft',
  empty = false,
  retainedInactive = false,
) {
  choirFixture.role = role;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith('/me/')
          ? { id: 1, username: 'reader', role }
          : url.includes('/mass-placements/')
            ? [entrance, { ...category, display_order: 1 }, inactive]
            : {
                ...mass,
                status,
                notes: 'Choir instructions',
                program: empty
                  ? []
                  : [
                      {
                        id: 5,
                        hymn,
                        placement: retainedInactive ? inactive : category,
                        position: 0,
                        notes: 'Quiet introduction',
                        created_at: category.created_at,
                        updated_at: category.updated_at,
                      },
                    ],
              },
      ),
    ),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/masses/1']}>
        <SessionProvider>
          <Routes>
            <Route path="/masses/:id" element={<MassViewPage />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('shows compact ordered hymns and notes with an explicit edit link', async () => {
  mount();
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Draft Mass');
  expect(screen.getByRole('link', { name: 'Edit Mass' })).toHaveAttribute('href', '/masses/1/edit');
  expect(screen.getByRole('region', { name: 'Communion' })).toHaveTextContent('First hymn');
  expect(screen.getByRole('region', { name: 'Entrance' })).toHaveTextContent('Hymn not selected');
  expect(
    within(screen.getByRole('region', { name: 'Saved hymn program' }))
      .getAllByRole('heading')
      .map((heading) => heading.textContent),
  ).toEqual(['Entrance', 'Communion']);
  expect(screen.queryByRole('region', { name: 'Retired section' })).not.toBeInTheDocument();
  expect(screen.getByText('Quiet introduction')).toBeVisible();
  expect(screen.getByText('Choir instructions')).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
});
it('keeps every active section visible when the entire saved program is empty', async () => {
  mount('Planner', 'draft', true);
  await screen.findByRole('heading', { level: 1 });
  expect(screen.getAllByText('Hymn not selected')).toHaveLength(2);
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Retired section' })).not.toBeInTheDocument();
});
it('retains a selected inactive section alongside empty active sections', async () => {
  mount('Planner', 'draft', false, true);
  await screen.findByRole('heading', { level: 1 });
  expect(screen.getByRole('region', { name: 'Retired section' })).toHaveTextContent('First hymn');
  expect(screen.getAllByText('Hymn not selected')).toHaveLength(2);
});
it.each([
  ['Viewer', 'draft'],
  ['Viewer', 'finalized'],
] as const)('does not offer editing to %s for a %s Mass', async (role, status) => {
  mount(role, status);
  await screen.findByRole('heading', { level: 1 });
  expect(screen.queryByRole('link', { name: 'Edit Mass' })).not.toBeInTheDocument();
});

const choirFixture = vi.hoisted(() => ({ role: 'Planner' }));
vi.mock('../features/choirs/ChoirProvider', () => ({
  useChoir: () => ({
    active: {
      id: 1,
      name: 'Test choir',
      role: choirFixture.role === 'Viewer' ? 'Member' : 'Planner',
    },
    choirs: [
      { id: 1, name: 'Test choir', role: choirFixture.role === 'Viewer' ? 'Member' : 'Planner' },
    ],
    select: async () => {},
    refresh: async () => {},
  }),
}));
