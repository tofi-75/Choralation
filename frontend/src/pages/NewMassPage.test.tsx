/** Duplicate confirmation gates creation; failures preserve the user's form. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { createMass, fetchMasses } from '../api/masses';
import { category, mass } from '../features/masses/fixtures.test-support';
import { NewMassPage } from './NewMassPage';
vi.mock('../api/masses', () => ({ createMass: vi.fn(), fetchMasses: vi.fn() }));
vi.mock('../features/auth/SessionProvider', () => ({
  useSession: () => ({ user: { role: 'Planner' } }),
}));
vi.mock('../features/hymns/queries', () => ({
  useCategories: () => ({ data: { 'liturgical-seasons': [category] } }),
}));
vi.mock('../features/masses/calendar', () => ({
  nearestSunday: () => '2026-10-11',
  fetchCalendar: async () => ({ season_id: 1, season_name: 'Holy Cross' }),
}));
beforeEach(() => {
  vi.mocked(fetchMasses).mockReset();
  vi.mocked(createMass).mockReset();
  vi.mocked(fetchMasses).mockResolvedValue({ count: 2, results: [], next: null, previous: null });
  vi.mocked(createMass).mockResolvedValue(mass);
});
async function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/masses/new']}>
        <Routes>
          <Route path="/masses/new" element={<NewMassPage />} />
          <Route path="/masses/1/edit" element={<p>Hymn step</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  fireEvent.click(screen.getByText('Title and notes (optional)'));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Choir Mass' } });
}
it('cancels a same-date creation and keeps inputs, then creates once after confirmation', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('2 Mass plans already exist for 2026-10-11'),
    ),
  );
  expect(fetchMasses).toHaveBeenCalledWith('from=2026-10-11&to=2026-10-11', 1);
  expect(createMass).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Title')).toHaveValue('Choir Mass');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Hymn step');
  expect(createMass).toHaveBeenCalledTimes(1);
  expect(createMass).toHaveBeenCalledWith(
    {
      date: '2026-10-11',
      title: 'Choir Mass',
      notes: null,
      liturgical_season_id: 1,
    },
    1,
  );
});
it('blocks creation when the same-date lookup fails and preserves details for retry', async () => {
  vi.mocked(fetchMasses).mockRejectedValue(new Error('Unable to check existing plans.'));
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Your input has been kept.');
  expect(createMass).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Title')).toHaveValue('Choir Mass');
});
it('proceeds without confirmation when the date has no saved plans', async () => {
  const confirm = vi.spyOn(window, 'confirm');
  vi.mocked(fetchMasses).mockResolvedValue({ count: 0, results: [], next: null, previous: null });
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Hymn step');
  expect(confirm).not.toHaveBeenCalled();
});

vi.mock('../features/choirs/ChoirProvider', () => ({
  useChoir: () => ({
    active: { id: 1, name: 'Test choir', role: 'Planner' },
    choirs: [],
    select: async () => {},
    refresh: async () => {},
  }),
}));
