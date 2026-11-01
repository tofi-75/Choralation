import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { SettingsPage } from './SettingsPage';
import { CalendarSettingsPage } from './CalendarSettingsPage';

const mocks = vi.hoisted(() => ({
  role: 'Admin',
  list: vi.fn(),
  impact: vi.fn(),
  save: vi.fn(),
  reorder: vi.fn(),
  calendar: vi.fn(),
  saveCalendar: vi.fn(),
  choir: vi.fn(),
  override: vi.fn(),
}));
vi.mock('../features/auth/SessionProvider', () => ({
  useSession: () => ({ user: { role: mocks.role } }),
}));
vi.mock('../api/choirs', () => ({ fetchChoir: (...args: unknown[]) => mocks.choir(...args) }));
vi.mock('../features/hymns/queries', () => ({
  useCategories: () => ({
    data: { 'liturgical-seasons': [{ id: 3, name: 'Easter', is_active: true }] },
  }),
}));
vi.mock('../api/settings', async (original) => ({
  ...(await original<object>()),
  listCategories: (...args: unknown[]) => mocks.list(...args),
  categoryImpact: (...args: unknown[]) => mocks.impact(...args),
  saveCategory: (...args: unknown[]) => mocks.save(...args),
  reorderCategories: (...args: unknown[]) => mocks.reorder(...args),
  getCalendarSettings: (...args: unknown[]) => mocks.calendar(...args),
  saveCalendarSettings: (...args: unknown[]) => mocks.saveCalendar(...args),
  saveCalendarOverride: (...args: unknown[]) => mocks.override(...args),
}));
const row = {
  id: 1,
  name: 'Traditional',
  slug: 'traditional',
  description: '',
  is_active: true,
  display_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};
const calendar = {
  calendar: 'maronite',
  time_zone: 'Asia/Beirut',
  version: 2,
  time_zones: ['Asia/Beirut', 'Pacific/Honolulu'],
  overrides: [],
};
function mount(path = '/settings') {
  const router = createMemoryRouter(
    [
      { path: '/settings', element: <SettingsPage /> },
      { path: '/choirs/:id/calendar', element: <CalendarSettingsPage /> },
      { path: '/dashboard', element: <p>Home</p> },
      { path: '/choirs/:id', element: <p>Choir</p> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = 'Admin';
  mocks.list.mockResolvedValue([row, { ...row, id: 2, name: 'Modern' }]);
  mocks.impact.mockResolvedValue({ ...row, reference_counts: { hymns: 2 } });
  mocks.calendar.mockResolvedValue(calendar);
  mocks.choir.mockResolvedValue({ name: 'Test choir', role: 'Planner' });
});
it('preserves edited text on a stale save and blocks deleting linked categories', async () => {
  mocks.save.mockRejectedValue(new ApiError('Refresh before saving.', 'settings_conflict', 409));
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole('button', { name: 'Edit Traditional' }));
  await user.clear(screen.getByRole('textbox', { name: /^Name/ }));
  await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'New traditional');
  await user.click(screen.getByRole('button', { name: 'Save category' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue('New traditional');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Delete Traditional' }));
  expect(await screen.findByText(/This category has 2 links/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Confirm delete' })).toBeDisabled();
});
it('requires the complete unfiltered order and submits its original version snapshot', async () => {
  mocks.reorder.mockResolvedValue({ results: [] });
  const user = userEvent.setup();
  mount();
  await screen.findByText('Traditional', { selector: 'strong' });
  await user.type(screen.getByRole('searchbox'), 'Traditional');
  expect(screen.getByRole('button', { name: 'Move Traditional down' })).toBeDisabled();
  await user.clear(screen.getByRole('searchbox'));
  await user.click(screen.getByRole('button', { name: 'Move Traditional down' }));
  await user.click(screen.getByRole('button', { name: 'Save order' }));
  await waitFor(() =>
    expect(mocks.reorder).toHaveBeenCalledWith('genres', expect.any(Array), [2, 1]),
  );
});
it('guards Admin settings from ordinary users', async () => {
  mocks.role = 'Viewer';
  mount();
  expect(await screen.findByText('Home')).toBeVisible();
  expect(mocks.list).not.toHaveBeenCalled();
});
it('saves choir calendar versions and protects deliberate unsaved defaults', async () => {
  mocks.saveCalendar.mockResolvedValue({ ...calendar, calendar: 'manual', version: 3 });
  const user = userEvent.setup();
  mount('/choirs/7/calendar');
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Calendar' }), 'manual');
  expect(screen.getByRole('button', { name: 'Save date override' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Save calendar settings' }));
  await waitFor(() =>
    expect(mocks.saveCalendar).toHaveBeenCalledWith(7, {
      calendar: 'manual',
      time_zone: 'Asia/Beirut',
      version: 2,
    }),
  );
  expect(await screen.findByText('Calendar settings saved.')).toBeVisible();
});
it('shows members read-only settings without mutation actions', async () => {
  mocks.choir.mockResolvedValue({ name: 'Test choir', role: 'Member' });
  mount('/choirs/7/calendar');
  expect(await screen.findByText('Your choir planners manage these settings.')).toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Calendar' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Save calendar settings' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Override date')).not.toBeInTheDocument();
});
