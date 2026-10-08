/** Day defaults and asynchronous calendar lookups must preserve deliberate newer choices. */
import { StrictMode, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { category } from './fixtures.test-support';
import { nearestSunday } from './calendar';
import { MassDateFields } from './MassDateFields';

afterEach(() => vi.unstubAllGlobals());
it('uses the closest Sunday including today and handles Beirut midnight/year rollover', () => {
  expect(nearestSunday(new Date('2026-10-04T09:00:00Z'))).toBe('2026-10-04');
  expect(nearestSunday(new Date('2026-10-06T09:00:00Z'))).toBe('2026-10-04');
  expect(nearestSunday(new Date('2026-10-08T09:00:00Z'))).toBe('2026-10-11');
  expect(nearestSunday(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-03');
});
function Fields({ initial = false }: { initial?: boolean }) {
  const [value, setValue] = useState({ date: '2026-10-11', season: null as number | null });
  const [pending, setPending] = useState(false);
  return (
    <>
      <MassDateFields
        date={value.date}
        season={value.season}
        seasons={[
          { ...category, id: 7, name: 'Holy Cross' },
          { ...category, id: 8, name: 'Pentecost' },
        ]}
        initialSuggestion={initial}
        onChange={vi.fn((date, season) => setValue({ date, season }))}
        onPending={setPending}
      />
      <output>{JSON.stringify({ ...value, pending })}</output>
    </>
  );
}
const suggestion = (date = '2026-10-11') => ({
  date,
  calendar: 'maronite',
  season_slug: 'holy-cross',
  season_name: 'Holy Cross',
  season_id: 7,
  day_title: null,
  source: 'local',
  source_url: 'https://example.com',
});
it('suggests the initial new-draft season under StrictMode but preserves saved plans on mount', async () => {
  const fetcher = vi.fn(async () => Response.json(suggestion()));
  vi.stubGlobal('fetch', fetcher);
  const mounted = render(
    <StrictMode>
      <Fields initial />
    </StrictMode>,
  );
  await screen.findByText('Maronite · Holy Cross');
  expect(screen.getByLabelText('Liturgical season')).toHaveValue('7');
  mounted.unmount();
  fetcher.mockClear();
  render(<Fields />);
  expect(fetcher).not.toHaveBeenCalled();
});
it('ignores an older response after a manual season choice and shows a usable failure state', async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  render(<Fields />);
  const user = userEvent.setup();
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-18' } });
  await user.selectOptions(screen.getByLabelText('Liturgical season'), '8');
  await act(async () => finish(Response.json(suggestion('2026-10-18'))));
  expect(screen.getByLabelText('Liturgical season')).toHaveValue('8');
  expect(screen.getByText('Season selected manually.')).toBeVisible();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('offline');
    }),
  );
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-25' } });
  await screen.findByText('Calendar unavailable. Choose a season manually.');
  expect(screen.getByLabelText('Liturgical season')).toHaveValue('');
});
