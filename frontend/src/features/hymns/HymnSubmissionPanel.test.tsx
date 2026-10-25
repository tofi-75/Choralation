import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { HymnSubmissionPanel } from './HymnSubmissionPanel';
import { hymn } from '../masses/fixtures.test-support';
import { reviewHymn, submitHymn } from '../../api/library';
const mocks = vi.hoisted(() => ({ id: 1, choir: true, refresh: vi.fn(async () => {}) }));
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ user: { id: mocks.id } }) }));
vi.mock('../choirs/ChoirProvider', () => ({
  useChoir: () => ({ active: { id: 7 }, choirs: mocks.choir ? [{ id: 7, name: 'My choir' }] : [] }),
}));
vi.mock('./queries', () => ({ useRefreshLibrary: () => mocks.refresh }));
vi.mock('../../api/library', () => ({ reviewHymn: vi.fn(), submitHymn: vi.fn() }));
afterEach(() => {
  mocks.id = 1;
  mocks.choir = true;
  vi.clearAllMocks();
});
const privateHymn = {
  ...hymn,
  created_by: 1,
  publication_status: 'private' as const,
  submission: {
    choir_id: null,
    choir_name: null,
    submitted_by: 'member',
    note: '',
    can_review: false,
  },
};
function mount(saved = privateHymn) {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<HymnSubmissionPanel hymn={saved} />} />
        <Route path="/choirs" element={<h1>Choirs</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}
it('lets a member send their private hymn to a chosen choir with clear publication consent', async () => {
  vi.mocked(submitHymn).mockResolvedValue(privateHymn);
  mount();
  expect(
    screen.getByText(/Approval publishes its metadata, lyrics and PDF to all signed-in users/),
  ).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Request planner approval' }));
  expect(submitHymn).toHaveBeenCalledWith(privateHymn, 7);
});
it('preserves private copies for users who have not joined a choir', () => {
  mocks.choir = false;
  mount();
  expect(screen.getByRole('link', { name: 'Join a choir' })).toHaveAttribute(
    'href',
    '/choirs/join',
  );
  expect(
    screen.queryByRole('button', { name: 'Request planner approval' }),
  ).not.toBeInTheDocument();
});
it.each(['approve', 'decline'] as const)(
  'returns the reviewer to Choirs after %s',
  async (decision) => {
    mocks.id = 2;
    vi.mocked(reviewHymn).mockResolvedValue(privateHymn);
    const pending = {
      ...privateHymn,
      publication_status: 'pending' as const,
      submission: { ...privateHymn.submission, can_review: true },
    };
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<HymnSubmissionPanel hymn={pending} />} />
          <Route path="/choirs" element={<h1>Choirs</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Feedback (optional)' }),
      'Please check the score',
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: decision === 'approve' ? 'Approve and publish' : 'Request changes',
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Choirs' })).toBeVisible();
    expect(reviewHymn).toHaveBeenCalledWith(pending, decision, 'Please check the score');
  },
);
