/** Form acceptance: complete write contract, active choices, and recoverable failures. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import { clearCsrfToken } from '../api/client';
import { textFields } from '../api/library';
import { SessionProvider } from '../features/auth/SessionProvider';
import { HymnFormPage } from './HymnFormPage';

const timestamp = '2026-10-06T00:00:00Z';
const category = (id: number, name: string, active = true) => ({
  id,
  name,
  slug: name.toLowerCase(),
  description: null,
  is_active: active,
  display_order: 0,
  created_at: timestamp,
  updated_at: timestamp,
});
const choices = {
  genres: [category(1, 'Traditional')],
  'liturgical-seasons': [category(2, 'Easter')],
  'mass-placements': [category(3, 'Communion')],
  languages: [category(4, 'Arabic'), category(5, 'Inactive language', false)],
  tags: [category(6, 'Mary')],
};
beforeEach(() => clearCsrfToken());

function mount(
  role = 'Planner',
  failure = false,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  edit = false,
) {
  const writes: Record<string, unknown>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/me/')) return Response.json({ id: 1, username: 'editor', role });
      if (url.includes('/csrf/')) return Response.json({ csrf_token: 'masked' });
      if (url.endsWith('/hymns/1/'))
        return Response.json({
          ...Object.fromEntries(textFields.map(([name]) => [name, null])),
          id: 1,
          title: 'Saved hymn',
          language: choices.languages[0],
          genres: [],
          seasons: [],
          placements: choices['mass-placements'],
          tags: [],
          sheet_music_pdf: null,
          usage_count: 0,
          last_used_date: null,
          is_polyphonic: false,
          voices: [],
          estimated_duration_minutes: null,
          is_season_neutral: true,
          is_active: true,
          created_at: timestamp,
          updated_at: timestamp,
          created_by: 1,
          updated_by: 1,
        });
      if (options?.method === 'POST') {
        writes.push(
          JSON.parse(
            String(options.body instanceof FormData ? options.body.get('data') : options.body),
          ) as Record<string, unknown>,
        );
        if (failure)
          return Response.json(
            {
              detail: 'Validation failed.',
              code: 'validation_error',
              errors: { title: ['Server rejected this title.'] },
            },
            { status: 400 },
          );
        throw new Error('No successful response needed in this scenario.');
      }
      const kind = url.split('/')[3] as keyof typeof choices;
      return Response.json(choices[kind]);
    }),
  );
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[edit ? '/hymns/1/edit' : '/hymns/new']}>
        <SessionProvider>
          <Routes>
            <Route path="/hymns/new" element={<HymnFormPage />} />
            <Route path="/hymns/:id/edit" element={<HymnFormPage />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return writes;
}

it.each([
  { edit: false, queryKey: ['categories'] },
  { edit: true, queryKey: ['categories'] },
  { edit: true, queryKey: ['hymn', '1'] },
])('preserves unsaved input through refresh failure and retry (%j)', async ({ edit, queryKey }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mount('Planner', false, client, edit);
  await screen.findByRole('heading', { name: edit ? 'Edit hymn' : 'Add hymn' });
  const title = screen.getByRole('textbox', { name: /^Title/ });
  await userEvent.clear(title);
  await userEvent.type(title, 'Unsaved title');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Polyphony (multiple voices)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add voice' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Voice 1' }), 'Soprano');
  const pdfInput = screen.getByLabelText('Sheet music PDF');
  const pdf = new File(['%PDF-1.4\n%%EOF'], 'unsaved.pdf', { type: 'application/pdf' });
  await userEvent.upload(pdfInput, pdf);

  const fetch = vi.mocked(globalThis.fetch);
  const successfulFetch = fetch.getMockImplementation()!;
  fetch.mockImplementation(async () => {
    throw new Error('Refresh unavailable');
  });
  await act(async () => {
    await client.invalidateQueries({ queryKey });
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to refresh hymn form');
  expect(screen.getByRole('textbox', { name: /^Title/ })).toBe(title);
  expect(title).toHaveValue('Unsaved title');
  expect(screen.getByRole('textbox', { name: 'Voice 1' })).toHaveValue('Soprano');
  expect((pdfInput as HTMLInputElement).files?.[0]).toBe(pdf);

  fetch.mockImplementation(successfulFetch);
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await act(async () => {
    await client.refetchQueries({ queryKey });
  });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(title).toHaveValue('Unsaved title');
  expect(screen.getByRole('textbox', { name: 'Voice 1' })).toHaveValue('Soprano');
  expect((pdfInput as HTMLInputElement).files?.[0]).toBe(pdf);
});

it('keeps Viewer routes read-only even when the URL is entered directly', async () => {
  mount('Viewer');
  expect(await screen.findByRole('heading', { name: 'Read-only access' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Save hymn' })).not.toBeInTheDocument();
});

it('requires placements and seasons, while excluding new inactive language choices', async () => {
  const writes = mount();
  await screen.findByRole('heading', { name: 'Add hymn' });
  await userEvent.type(screen.getByRole('textbox', { name: /^Title/ }), 'ترنيمة');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: /^Language/ }), '4');
  expect(
    screen.queryByRole('option', { name: 'Inactive language (inactive)' }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save hymn' }));
  expect(await screen.findByText('Choose at least one placement.')).toBeVisible();
  expect(screen.getByText('Choose a season or mark this hymn season-neutral.')).toBeVisible();
  expect(writes).toHaveLength(0);
});

it('searches classifications and retains values plus field errors after a failed save', async () => {
  const writes = mount('Planner', true);
  await screen.findByRole('heading', { name: 'Add hymn' });
  await userEvent.type(screen.getByRole('textbox', { name: /^Title/ }), 'ترنيمة محفوظة');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: /^Language/ }), '4');
  const placements = screen.getByRole('group', { name: 'Suitable placements' });
  await userEvent.click(
    within(placements).getByRole('button', { name: /^Choose suitable placements/ }),
  );
  await userEvent.type(within(placements).getByRole('textbox'), 'comm');
  await userEvent.click(within(placements).getByRole('checkbox', { name: 'Communion' }));
  await userEvent.click(screen.getByRole('button', { name: /^Choose suitable seasons/ }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Easter' }));
  await userEvent.click(screen.getByText('More hymn details', { exact: true }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), 'Kept after failure');
  await userEvent.click(screen.getByRole('button', { name: 'Save hymn' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Your input has been kept.');
  expect(screen.getByRole('textbox', { name: /^Title/ })).toHaveValue('ترنيمة محفوظة');
  expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('Kept after failure');
  expect(screen.getByRole('textbox', { name: /^Title/ })).toHaveAccessibleDescription(
    'Server rejected this title.',
  );
  expect(writes[0]).toMatchObject({
    language_id: 4,
    placement_ids: [3],
    season_ids: [2],
    notes: 'Kept after failure',
  });
});

it('keeps polyphony voices, numeric duration, and PDF values on a failed save', async () => {
  const writes = mount('Planner', true);
  await screen.findByRole('heading', { name: 'Add hymn' });
  await userEvent.type(screen.getByRole('textbox', { name: /^Title/ }), 'Polyphonic hymn');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: /^Language/ }), '4');
  await userEvent.click(screen.getByRole('button', { name: /^Choose suitable placements/ }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Communion' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Suitable regardless of season' }));
  await userEvent.type(screen.getByRole('spinbutton', { name: 'Duration (minutes)' }), '3.5');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Polyphony (multiple voices)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add voice' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Voice 1' }), 'Soprano');
  await userEvent.click(screen.getByRole('button', { name: 'Add voice' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Voice 2' }), 'Alto');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Polyphony (multiple voices)' }));
  expect(confirm).toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Voice 2' })).toHaveValue('Alto');
  await userEvent.upload(
    screen.getByLabelText('Sheet music PDF'),
    new File(['%PDF-1.4\n%%EOF'], 'score.pdf', { type: 'application/pdf' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Save hymn' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Your input has been kept');
  expect(screen.getByRole('spinbutton', { name: 'Duration (minutes)' })).toHaveValue(3.5);
  expect(screen.getByRole('textbox', { name: 'Voice 1' })).toHaveValue('Soprano');
  expect(writes[0]).toMatchObject({
    is_polyphonic: true,
    voices: ['Soprano', 'Alto'],
    estimated_duration_minutes: '3.5',
  });
  expect(screen.getByLabelText('Sheet music PDF')).toHaveProperty(
    'files',
    expect.objectContaining({ length: 1 }),
  );
});
