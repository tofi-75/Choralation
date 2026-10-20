/** Material priority, reversible focus navigation, and screen-awake ownership. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { hymn, mass, category } from '../masses/fixtures.test-support';
import { MassFocusMode } from '../masses/MassFocusMode';
import { HymnMaterial } from './HymnMaterial';

vi.mock('./PdfSheet', () => ({
  default: ({ onFailure }: { onFailure: () => void }) => (
    <div>
      <span>PDF preview</span>
      <button onClick={onFailure}>Simulate PDF failure</button>
    </div>
  ),
}));
afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
  vi.restoreAllMocks();
});

it('prioritizes PDF over lyrics and falls back after a loading failure', async () => {
  render(
    <HymnMaterial
      focus
      hymn={{
        ...hymn,
        lyrics: 'Saved lyrics',
        sheet_music_pdf: { url: '/private.pdf', name: 'score.pdf' },
      }}
    />,
  );
  expect(await screen.findByText('PDF preview')).toBeVisible();
  expect(screen.queryByText('Saved lyrics')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Simulate PDF failure' }));
  expect(screen.getByText('Saved lyrics')).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent('Sheet music could not be displayed');
});

it('navigates selections with swipes and keys, avoids wrapping, restores focus, and releases/reacquires the wake lock', async () => {
  const locks: (EventTarget & { released: boolean; release: ReturnType<typeof vi.fn> })[] = [];
  const request = vi.fn(async () => {
    const lock = Object.assign(new EventTarget(), {
      released: false,
      release: vi.fn(async () => {}),
    });
    locks.push(lock);
    return lock;
  });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const selections = [
    { id: 1, hymn: { ...hymn, lyrics: 'First lyrics' } },
    { id: 2, hymn: { ...hymn, title: 'Second title', lyrics: null } },
  ].map((row, position) => ({
    ...row,
    placement: category,
    position,
    notes: null,
    created_at: mass.created_at,
    updated_at: mass.updated_at,
  }));
  const view = render(<MassFocusMode selections={selections} />);
  const trigger = screen.getByRole('button', { name: 'Focus mode' });
  await userEvent.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Focus mode' });
  expect(await within(dialog).findByText('Screen kept awake')).toBeVisible();
  expect(request).toHaveBeenCalledWith('screen');
  expect(within(dialog).getByText('First lyrics')).toBeVisible();
  expect(within(dialog).getByRole('button', { name: 'Previous hymn' })).toBeDisabled();
  const reading = dialog.querySelector('.focus-reading')!;
  fireEvent.touchStart(reading, {
    touches: [{ clientX: 200, clientY: 100 }],
    changedTouches: [{ clientX: 200, clientY: 100 }],
  });
  fireEvent.touchEnd(reading, { changedTouches: [{ clientX: 60, clientY: 105 }] });
  expect(within(dialog).getByText('Hymn 2 of 2')).toBeVisible();
  expect(within(dialog).getByRole('button', { name: 'Next hymn' })).toBeDisabled();
  view.rerender(<MassFocusMode selections={[]} />);
  expect(within(dialog).getByText('Hymn 2 of 2')).toBeVisible();
  view.rerender(<MassFocusMode selections={selections} />);
  fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
  expect(within(dialog).getByText('First lyrics')).toBeVisible();
  await act(async () => {
    locks[0].released = true;
    locks[0].dispatchEvent(new Event('release'));
  });
  expect(within(dialog).getByText('Screen awake paused.')).toBeVisible();
  fireEvent(document, new Event('visibilitychange'));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(locks[1].release).toHaveBeenCalledOnce();
  await waitFor(() => expect(trigger).toHaveFocus());
});

it('keeps focus mode usable if the browser refuses the wake lock', async () => {
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: vi.fn().mockRejectedValue(new Error('Declined')) },
  });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  render(
    <MassFocusMode
      selections={[
        {
          id: 1,
          hymn,
          placement: category,
          position: 0,
          notes: null,
          created_at: mass.created_at,
          updated_at: mass.updated_at,
        },
      ]}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Focus mode' }));
  expect(await screen.findByText(/Screen may sleep/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Exit focus mode' })).toBeVisible();
});

it('releases a late wake-lock grant after focus mode has already closed', async () => {
  let resolve!: (lock: EventTarget & { release: ReturnType<typeof vi.fn> }) => void;
  const request = vi.fn(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const lock = Object.assign(new EventTarget(), { release: vi.fn(async () => {}) });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  render(
    <MassFocusMode
      selections={[
        {
          id: 1,
          hymn,
          placement: category,
          position: 0,
          notes: null,
          created_at: mass.created_at,
          updated_at: mass.updated_at,
        },
      ]}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Focus mode' }));
  await waitFor(() => expect(request).toHaveBeenCalledOnce());
  await userEvent.click(screen.getByRole('button', { name: 'Exit focus mode' }));
  await act(async () => {
    resolve(lock);
  });
  expect(lock.release).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
