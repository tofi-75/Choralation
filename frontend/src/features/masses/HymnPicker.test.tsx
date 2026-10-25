/** Season suitability is shared by picker choices and the working program warnings. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { fetchHymns } from '../../api/library';
import { DraftSaver } from './DraftSaver';
import { HymnPicker } from './HymnPicker';
import { category, hymn, mass } from './fixtures.test-support';
import { hasSeasonMismatch, seasonLabel } from './seasonSuitability';
vi.mock('../../api/library', async (original) => ({
  ...(await original<typeof import('../../api/library')>()),
  fetchHymns: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const season = { ...category, id: 7, name: 'Holy Cross' };
const otherSeason = { ...category, id: 8, name: 'Advent' };
const categories = {
  languages: [category],
  genres: [],
  tags: [],
  'mass-placements': [category],
  'liturgical-seasons': [season, otherSeason],
};
function picker(neutral: boolean) {
  const choice = { ...hymn, is_season_neutral: neutral, seasons: [otherSeason] };
  vi.mocked(fetchHymns).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [choice],
  });
  const add = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <HymnPicker
        categories={categories}
        placement={category}
        season={7}
        selected={[]}
        add={add}
        close={vi.fn()}
        restoreFocus={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { add, choice };
}
it('Any season overrides retained season links; missing classification is not an explicit mismatch', () => {
  expect(hasSeasonMismatch({ ...hymn, seasons: [otherSeason] }, 7)).toBe(false);
  expect(seasonLabel({ ...hymn, seasons: [otherSeason] })).toBe('Any season');
  expect(hasSeasonMismatch({ ...hymn, is_season_neutral: false, seasons: [] }, 7)).toBe(false);
  expect(hasSeasonMismatch({ ...hymn, is_season_neutral: false, seasons: [otherSeason] }, 7)).toBe(
    true,
  );
});
it('Any-season choice bypasses the notice and generates no local program season warning', async () => {
  const { add, choice } = picker(true);
  fireEvent.click(await screen.findByRole('button', { name: 'Choose First hymn' }));
  expect(add).toHaveBeenCalledExactlyOnceWith(choice);
  expect(screen.queryByRole('region', { name: 'Selection warnings' })).toBeNull();
  const saver = new DraftSaver({
    ...mass,
    liturgical_season: season,
    program: [
      {
        id: 1,
        hymn: choice,
        placement: category,
        position: 0,
        notes: null,
        created_at: category.created_at,
        updated_at: category.updated_at,
      },
    ],
  });
  expect(saver.programWarnings).toEqual([]);
});
it('explicit other-season choice explains its classification and requires confirmation', async () => {
  const { add, choice } = picker(false);
  fireEvent.click(await screen.findByRole('button', { name: 'Choose First hymn' }));
  expect(screen.getByRole('region', { name: 'Selection warnings' })).toHaveTextContent(
    'Classified for Advent; this Mass is Holy Cross.',
  );
  expect(add).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Add anyway' }));
  expect(add).toHaveBeenCalledExactlyOnceWith(choice);
});
it('desktop metadata columns toggle server ordering and preserve placement/season preference', async () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  picker(true);
  expect(await screen.findByRole('table')).toBeVisible();
  expect(screen.getAllByRole('columnheader')).toHaveLength(9);
  fireEvent.click(screen.getByRole('button', { name: 'Sort by Minutes' }));
  await waitFor(() =>
    expect(fetchHymns).toHaveBeenLastCalledWith(expect.stringContaining('ordering=duration'), null),
  );
  const params = new URLSearchParams(vi.mocked(fetchHymns).mock.lastCall![0]);
  expect(params.get('placements')).toBe('1');
  expect(params.get('preferred_season')).toBe('7');
  expect(params.get('page')).toBe('1');
  fireEvent.click(screen.getByRole('button', { name: 'Sort by Minutes' }));
  await waitFor(() =>
    expect(fetchHymns).toHaveBeenLastCalledWith(
      expect.stringContaining('ordering=-duration'),
      null,
    ),
  );
  expect(screen.getByRole('columnheader', { name: /Minutes/ })).toHaveAttribute(
    'aria-sort',
    'descending',
  );
});
