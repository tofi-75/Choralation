/** Drag preview is reversible; persistence happens only after an explicit drop. */
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SortableProgram, reorderPlacement } from './SortableProgram';
import { hymn } from './fixtures.test-support';
const first = { key: 'first', id: 41, placement_id: 1, hymn, notes: 'Keep first notes' };
const second = {
  key: 'second',
  id: 42,
  placement_id: 1,
  hymn: { ...hymn, id: 2, title: 'Second hymn' },
  notes: 'Keep second notes',
};
function editor(disabled = false) {
  const commit = vi.fn();
  const view = render(
    <SortableProgram rows={[first, second]} disabled={disabled} onReorder={commit}>
      {(row, handle) => (
        <>
          <button {...handle}>Drag</button>
          <span>{row.hymn.title}</span>
        </>
      )}
    </SortableProgram>,
  );
  return { commit, ...view };
}
it('reorders the latest placement slots while preserving other placements, IDs and notes', () => {
  const other = { ...first, key: 'other', placement_id: 2 };
  const rows = [first, other, second];
  const reordered = reorderPlacement(rows, 1, ['second', 'first']);
  expect(reordered).toEqual([second, other, first]);
  expect(reordered[0]).toBe(second);
  expect(reorderPlacement(rows, 1, ['second'])).toBe(rows);
  expect(reorderPlacement(rows, 1, ['first', 'first'])).toBe(rows);
});
it('keyboard pickup previews order; drop commits once and Escape cancels subsequent work', () => {
  const { commit } = editor();
  const handle = screen.getByRole('button', { name: 'Reorder Second hymn' });
  handle.focus();
  fireEvent.keyDown(handle, { key: ' ' });
  fireEvent.keyDown(handle, { key: 'ArrowUp' });
  expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Second hymn');
  expect(handle).toHaveFocus();
  expect(commit).not.toHaveBeenCalled();
  fireEvent.keyDown(handle, { key: ' ' });
  expect(commit).toHaveBeenCalledExactlyOnceWith(['second', 'first']);
  fireEvent.keyDown(handle, { key: ' ' });
  fireEvent.keyDown(handle, { key: 'ArrowUp' });
  fireEvent.keyDown(handle, { key: 'Escape' });
  expect(commit).toHaveBeenCalledTimes(1);
  expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('First hymn');
});
it('read-only handles cannot start a reorder', () => {
  const { commit } = editor(true);
  const handle = screen.getByRole('button', { name: 'Reorder Second hymn' });
  expect(handle).toBeDisabled();
  fireEvent.keyDown(handle, { key: ' ' });
  fireEvent.keyDown(handle, { key: 'ArrowUp' });
  fireEvent.keyDown(handle, { key: ' ' });
  expect(commit).not.toHaveBeenCalled();
});
it('membership or access changes cancel a preview rather than lose a selection', () => {
  const { commit, rerender } = editor();
  const handle = screen.getByRole('button', { name: 'Reorder Second hymn' });
  fireEvent.keyDown(handle, { key: ' ' });
  fireEvent.keyDown(handle, { key: 'ArrowUp' });
  rerender(
    <SortableProgram rows={[first]} disabled={false} onReorder={commit}>
      {(row, props) => <button {...props}>{row.hymn.title}</button>}
    </SortableProgram>,
  );
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(commit).not.toHaveBeenCalled();
});
