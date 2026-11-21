import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { category, hymn, mass } from './fixtures.test-support';
import { SavedHymnRow } from './SavedHymnRow';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      isPrimary: boolean;
      pointerId: number;
      constructor(
        type: string,
        options: MouseEventInit & { isPrimary?: boolean; pointerId?: number } = {},
      ) {
        super(type, options);
        this.isPrimary = options.isPrimary ?? true;
        this.pointerId = options.pointerId ?? 1;
      }
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mount() {
  const open = vi.fn();
  render(
    <MemoryRouter>
      <SavedHymnRow
        massId={42}
        openFocus={open}
        row={{
          id: 7,
          hymn,
          placement: category,
          position: 1,
          notes: 'Quietly',
          created_at: mass.created_at,
          updated_at: mass.updated_at,
        }}
      />
    </MemoryRouter>,
  );
  return { open, row: screen.getByRole('button', { name: hymn.title }) };
}

it('opens the exact selection on activation anywhere in the row', () => {
  const { open, row } = mount();
  fireEvent.click(screen.getByText('Quietly'));
  expect(open).toHaveBeenCalledWith(7, row);
});

it('offers the hymn page after 500ms and suppresses the release click', () => {
  const { open, row } = mount();
  fireEvent.pointerDown(row, { clientX: 30, clientY: 30, button: 0 });
  act(() => vi.advanceTimersByTime(499));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('link', { name: 'Go to hymn' })).toHaveAttribute(
    'href',
    `/hymns/${hymn.id}`,
  );
  fireEvent.pointerUp(row);
  fireEvent.click(row);
  expect(open).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(row).toHaveFocus();
});

it.each(['movement', 'scroll', 'cancel', 'multitouch'])(
  'cancels a hold on %s without opening Focus',
  (reason) => {
    const { open, row } = mount();
    fireEvent.pointerDown(row, { clientX: 30, clientY: 30, button: 0 });
    if (reason === 'movement') fireEvent.pointerMove(row, { clientX: 41, clientY: 30 });
    if (reason === 'scroll') fireEvent.scroll(window);
    if (reason === 'cancel') fireEvent.pointerCancel(row);
    if (reason === 'multitouch') fireEvent.pointerDown(document, { isPrimary: false });
    act(() => vi.advanceTimersByTime(600));
    fireEvent.click(row);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  },
);

it('supports keyboard context actions and outside dismissal', () => {
  const { row } = mount();
  fireEvent.keyDown(row, { key: 'F10', shiftKey: true });
  expect(screen.getByRole('dialog', { name: 'Hymn actions' })).toBeVisible();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('cancels a pending hold when the mouse is released outside the row', () => {
  const { row, open } = mount();
  fireEvent.pointerDown(row, { clientX: 30, clientY: 30, button: 0 });
  fireEvent.pointerLeave(row);
  fireEvent.pointerUp(document.body);
  act(() => vi.advanceTimersByTime(600));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(open).not.toHaveBeenCalled();
  // A new deliberate activation still works after the canceled hold.
  fireEvent.pointerDown(row, { clientX: 30, clientY: 30, button: 0 });
  fireEvent.pointerUp(row);
  fireEvent.click(row);
  expect(open).toHaveBeenCalledWith(7, row);
});

it.each(['movement', 'cancel', 'blur'])(
  'cancels a hold on outside %s and suppresses its click',
  (reason) => {
    const { row, open } = mount();
    fireEvent.pointerDown(row, { clientX: 30, clientY: 30, button: 0 });
    if (reason === 'movement') fireEvent.pointerMove(document.body, { clientX: 41, clientY: 30 });
    if (reason === 'cancel') fireEvent.pointerCancel(document.body);
    if (reason === 'blur') fireEvent.blur(window);
    act(() => vi.advanceTimersByTime(600));
    fireEvent.click(row);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  },
);

it('preserves click suppression when a second finger lands on the same row', () => {
  const { row, open } = mount();
  fireEvent.pointerDown(row, { clientX: 30, clientY: 30, button: 0, pointerId: 1 });
  fireEvent.pointerDown(row, {
    clientX: 31,
    clientY: 31,
    button: 0,
    pointerId: 2,
    isPrimary: false,
  });
  fireEvent.pointerUp(row, { pointerId: 1 });
  fireEvent.click(row);
  fireEvent.pointerUp(row, { pointerId: 2, isPrimary: false });
  act(() => vi.advanceTimersByTime(600));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(open).not.toHaveBeenCalled();
  fireEvent.pointerDown(row, { clientX: 30, clientY: 30, button: 0, pointerId: 3 });
  fireEvent.pointerUp(row, { pointerId: 3 });
  fireEvent.click(row);
  expect(open).toHaveBeenCalledOnce();
});

it('keeps a deliberate hold active when an unrelated pointer is released', () => {
  const { row } = mount();
  fireEvent.pointerDown(row, { clientX: 30, clientY: 30, button: 0, pointerId: 1 });
  fireEvent.pointerUp(document.body, { pointerId: 2 });
  act(() => vi.advanceTimersByTime(500));
  expect(screen.getByRole('dialog', { name: 'Hymn actions' })).toBeVisible();
});
