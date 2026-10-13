/** Local drag preview commits once on drop. Pointer capture and edge scrolling support
 * touch; keyboard pickup/move/drop keeps the same selection identities and notes.
 * Cancellation, stale membership or read-only transitions never persist a preview.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { DraftRow } from './DraftSaver';

/** Replace only this placement's slots using the latest draft (including new IDs/notes). */
export function reorderPlacement(rows: DraftRow[], placement: number, keys: string[]): DraftRow[] {
  const members = rows.filter((row) => row.placement_id === placement);
  const lookup = new Map(members.map((row) => [row.key, row]));
  if (
    keys.length !== members.length ||
    new Set(keys).size !== keys.length ||
    keys.some((key) => !lookup.has(key))
  )
    return rows;
  let index = 0;
  return rows.map((row) => (row.placement_id === placement ? lookup.get(keys[index++])! : row));
}
type Gesture = { key: string; keys: string[]; original: string[]; pointer?: number; y?: number };
export function SortableProgram({
  rows,
  disabled,
  onReorder,
  children,
}: {
  rows: DraftRow[];
  disabled: boolean;
  onReorder: (keys: string[]) => void;
  children: (row: DraftRow, handle: ButtonHTMLAttributes<HTMLButtonElement>) => ReactNode;
}) {
  const root = useRef<HTMLOListElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const animation = useRef<number | undefined>(undefined);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const instructions = useId();
  const keys = rows.map((row) => row.key);
  const valid = (current: Gesture) =>
    !disabled &&
    current.original.length === keys.length &&
    keys.every((key) => current.original.includes(key));
  useEffect(
    () => () => {
      if (animation.current !== undefined) cancelAnimationFrame(animation.current);
    },
    [],
  );
  // Cancel an in-progress preview if another action changes membership or access.
  const membership = keys.join('\0');
  useEffect(() => {
    if (gesture.current && !valid(gesture.current)) finish(false);
  }, [disabled, membership]);
  useLayoutEffect(() => {
    const current = gesture.current;
    if (current && current.pointer === undefined) {
      root.current
        ?.querySelector<HTMLElement>(`[data-program-key="${current.key}"] .drag-handle`)
        ?.focus();
    }
  }, [preview]);
  function finish(commit: boolean) {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    if (animation.current !== undefined) cancelAnimationFrame(animation.current);
    animation.current = undefined;
    if (current.pointer !== undefined && root.current?.hasPointerCapture(current.pointer))
      root.current.releasePointerCapture(current.pointer);
    if (commit && valid(current)) {
      if (current.keys.some((key, index) => key !== current.original[index]))
        onReorder(current.keys);
      setMessage('Hymn order updated.');
    } else setMessage('Reordering cancelled.');
    setPreview(null);
    setMoving(null);
  }
  function move(to: number) {
    const current = gesture.current;
    if (!current || !valid(current)) {
      finish(false);
      return;
    }
    const from = current.keys.indexOf(current.key);
    if (to < 0 || to >= current.keys.length || to === from) return;
    const next = [...current.keys];
    next.splice(from, 1);
    next.splice(to, 0, current.key);
    current.keys = next;
    setPreview(next);
    setMessage(`Position ${to + 1} of ${next.length}.`);
  }
  function hover(y: number) {
    const current = gesture.current;
    if (!current || !root.current) return;
    // Midpoints prevent a row switching back merely because the pointer touches its edge.
    const elements = [...root.current.querySelectorAll<HTMLElement>('[data-program-key]')];
    for (let index = 0; index < elements.length; index++) {
      const rectangle = elements[index].getBoundingClientRect();
      if (elements[index].dataset.programKey === current.key) continue;
      const from = current.keys.indexOf(current.key);
      const midpoint = rectangle.top + rectangle.height / 2;
      if ((index < from && y < midpoint) || (index > from && y > midpoint)) {
        move(index);
        break;
      }
    }
  }
  function edgeScroll() {
    const current = gesture.current;
    if (!current || current.pointer === undefined || current.y === undefined) return;
    const footer = document.querySelector('.sticky-form-actions')?.getBoundingClientRect();
    const bottom = footer ? Math.min(window.innerHeight, footer.top) : window.innerHeight;
    const delta = current.y < 70 ? -12 : current.y > bottom - 70 ? 12 : 0;
    if (delta) {
      window.scrollBy(0, delta);
      hover(current.y);
    }
    animation.current = requestAnimationFrame(edgeScroll);
  }
  const ordered =
    preview && gesture.current && valid(gesture.current)
      ? preview.map((key) => rows.find((row) => row.key === key)!)
      : rows;
  return (
    <>
      <p id={instructions} className="sr-only">
        Drag to reorder within this section. With a keyboard, press Space to pick up, arrows to
        move, Space to drop, or Escape to cancel.
      </p>
      <ol
        className="program-rows"
        ref={root}
        onPointerMove={(event) => {
          if (gesture.current?.pointer === event.pointerId) {
            gesture.current.y = event.clientY;
            hover(event.clientY);
          }
        }}
        onPointerUp={(event) => {
          if (gesture.current?.pointer === event.pointerId) finish(true);
        }}
        onPointerCancel={() => finish(false)}
        onLostPointerCapture={() => finish(false)}
      >
        {ordered.map((row) => (
          <li
            className={`program-row ${moving === row.key ? 'is-dragging' : ''}`}
            key={row.key}
            data-program-key={row.key}
          >
            {children(row, {
              className: 'drag-handle',
              disabled: disabled || rows.length < 2,
              'aria-label': `Reorder ${row.hymn.title}`,
              'aria-describedby': instructions,
              'aria-pressed': moving === row.key,
              title: 'Drag to reorder within this section',
              onPointerDown: (event) => {
                if (disabled || rows.length < 2 || event.button !== 0) return;
                event.preventDefault();
                finish(false);
                event.currentTarget.focus();
                gesture.current = {
                  key: row.key,
                  keys: [...keys],
                  original: [...keys],
                  pointer: event.pointerId,
                  y: event.clientY,
                };
                root.current?.setPointerCapture(event.pointerId);
                setMoving(row.key);
                setPreview([...keys]);
                setMessage(`Picked up ${row.hymn.title}.`);
                animation.current = requestAnimationFrame(edgeScroll);
              },
              onKeyDown: (event) => {
                if (disabled || rows.length < 2) return;
                if (event.key === ' ' || event.key === 'Enter') {
                  event.preventDefault();
                  if (gesture.current?.key === row.key) finish(true);
                  else {
                    finish(false);
                    gesture.current = { key: row.key, keys: [...keys], original: [...keys] };
                    setMoving(row.key);
                    setPreview([...keys]);
                    setMessage(`Picked up ${row.hymn.title}.`);
                  }
                } else if (gesture.current?.key === row.key) {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    finish(false);
                  }
                  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    move(
                      gesture.current.keys.indexOf(row.key) + (event.key === 'ArrowUp' ? -1 : 1),
                    );
                  }
                }
              },
              onBlur: () => {
                if (gesture.current?.pointer === undefined && gesture.current?.key === row.key)
                  finish(false);
              },
            })}
          </li>
        ))}
      </ol>
      <span className="sr-only" role="status" aria-live="polite">
        {message}
      </span>
    </>
  );
}
