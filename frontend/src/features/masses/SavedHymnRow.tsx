/** A normal activation opens Focus; a deliberate hold offers the library page. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import type { Mass } from '../../api/masses';
import { HymnMusicalSummary } from '../hymns/HymnMusicalSummary';

export function SavedHymnRow({
  row,
  massId,
  openFocus,
}: {
  row: Mass['program'][number];
  massId: number;
  openFocus: (id: number, trigger: HTMLElement) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };
  function showMenu() {
    cancel();
    suppressClick.current = true;
    const box = button.current!.getBoundingClientRect();
    setMenu({
      x: Math.max(8, Math.min(box.left + 12, window.innerWidth - 192)),
      y: Math.max(8, Math.min(box.bottom, window.innerHeight - 64)),
    });
  }
  useEffect(() => {
    const stop = () => {
      if (start.current) suppressClick.current = true;
      cancel();
    };
    const resize = () => {
      stop();
      setMenu(null);
    };
    const multitouch = (event: PointerEvent) => {
      if (!event.isPrimary) {
        suppressClick.current = true;
        cancel();
      }
    };
    const move = (event: PointerEvent) => {
      const active = start.current;
      if (
        active &&
        active.id === event.pointerId &&
        Math.hypot(event.clientX - active.x, event.clientY - active.y) > 10
      )
        stop();
    };
    const finish = (event: PointerEvent) => {
      if (start.current?.id === event.pointerId) cancel();
    };
    const cancelPointer = (event: PointerEvent) => {
      if (start.current?.id === event.pointerId) stop();
    };
    window.addEventListener('scroll', stop, true);
    window.addEventListener('resize', resize);
    document.addEventListener('pointerdown', multitouch, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointercancel', cancelPointer, true);
    window.addEventListener('blur', stop);
    return () => {
      cancel();
      window.removeEventListener('scroll', stop, true);
      window.removeEventListener('resize', resize);
      document.removeEventListener('pointerdown', multitouch, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', cancelPointer, true);
      window.removeEventListener('blur', stop);
    };
  }, []);
  useEffect(() => {
    if (!menu) return;
    popup.current?.querySelector('a')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !popup.current?.contains(event.target)) setMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenu(null);
        button.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [menu]);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="saved-hymn-link"
        aria-labelledby={`saved-hymn-${row.id}`}
        aria-haspopup="dialog"
        aria-expanded={Boolean(menu)}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          cancel();
          suppressClick.current = false;
          start.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          timer.current = setTimeout(showMenu, 500);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          showMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            showMenu();
          } else if (event.key === 'Enter' || event.key === ' ') suppressClick.current = false;
        }}
        onClick={(event) => {
          if (!suppressClick.current) openFocus(row.id, event.currentTarget);
        }}
      >
        <span className="saved-hymn-title" id={`saved-hymn-${row.id}`} dir="auto">
          {row.hymn.title}
        </span>
        <HymnMusicalSummary hymn={row.hymn} showLanguage />
        {row.notes && (
          <span className="tiny preserve-lines" dir="auto">
            {row.notes}
          </span>
        )}
      </button>
      {menu &&
        createPortal(
          <div
            ref={popup}
            className="saved-hymn-menu"
            role="dialog"
            aria-label="Hymn actions"
            style={{ left: menu.x, top: menu.y }}
          >
            <Link to={`/hymns/${row.hymn.id}`} state={{ returnToMassId: massId }}>
              Go to hymn
            </Link>
          </div>,
          document.body,
        )}
    </>
  );
}
