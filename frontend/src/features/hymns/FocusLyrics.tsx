import { useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { Ref } from 'react';
import { useReaderSwipe } from './useReaderSwipe';

export type LyricPageNavigation = (direction: -1 | 1) => void;

const sizes = ['standard', 'large', 'extra-large'] as const;
export type LyricSize = (typeof sizes)[number];

function measurePages(text: string, probe: HTMLElement, availableHeight: number) {
  // Resolve direction from the whole song so a later page starting with a different script
  // retains the original text alignment and the zoom controls stay on the same side.
  probe.dir = 'auto';
  probe.textContent = text;
  const direction = getComputedStyle(probe).direction === 'rtl' ? 'rtl' : 'ltr';
  probe.dir = direction;
  const starts = [0];

  if (availableHeight > 0 && probe.getBoundingClientRect().height > availableHeight) {
    const breaks =
      typeof Intl.Segmenter === 'function'
        ? Array.from(new Intl.Segmenter().segment(text), ({ index }) => index)
        : Array.from(text.matchAll(/\s+/gu), (match) => match.index + match[0].length).filter(
            (offset) => offset < text.length,
          );
    if (breaks[0] !== 0) breaks.unshift(0);
    breaks.push(text.length);

    let start = 0;
    function fits(end: number) {
      probe.textContent = text.slice(breaks[start], breaks[end]);
      return probe.getBoundingClientRect().height <= availableHeight;
    }

    const last = breaks.length - 1;
    while (start < last) {
      // Limit the search to the text around this page before measuring larger slices.
      let low = start + 1;
      let high = Math.min(start + 64, last);
      while (high < last && fits(high)) {
        low = high;
        high = Math.min(start + (high - start) * 2, last);
      }
      while (low < high) {
        const candidate = Math.ceil((low + high) / 2);
        if (fits(candidate)) low = candidate;
        else high = candidate - 1;
      }

      let end = low;
      if (end < last && !/\s/u.test(text.slice(breaks[end - 1], breaks[end]))) {
        // Keep words intact where there is a nearby boundary. Long unbroken text can wrap.
        for (let previous = end - 1; previous > start + (end - start) / 2; previous--) {
          if (/\s/u.test(text.slice(breaks[previous - 1], breaks[previous]))) {
            end = previous;
            break;
          }
        }
      }
      if (end < last) starts.push(breaks[end]);
      start = end;
    }
  }

  probe.textContent = '';
  return { starts, direction } as const;
}

export function FocusLyrics({
  lyrics,
  size,
  onSizeChange,
  position,
  onPositionChange,
  navigationRef,
  onExit,
  onHymnSwipe,
}: {
  lyrics: string;
  size: LyricSize;
  onSizeChange?: (size: LyricSize) => void;
  position?: number;
  onPositionChange?: (position: number) => void;
  navigationRef?: Ref<LyricPageNavigation>;
  onExit?: () => void;
  onHymnSwipe?: LyricPageNavigation;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [localPosition, setLocalPosition] = useState(0);
  const [layout, setLayout] = useState<{ starts: number[]; direction: 'rtl' | 'ltr' }>({
    starts: [0],
    direction: 'ltr',
  });
  const offset = position ?? localPosition;
  const pageIndex = Math.max(
    0,
    layout.starts.findLastIndex((start) => start <= offset),
  );
  const sizeIndex = sizes.indexOf(size);
  const turn: LyricPageNavigation = (direction) => {
    const start = layout.starts[pageIndex + direction];
    if (start === undefined) return;
    setLocalPosition(start);
    onPositionChange?.(start);
  };

  useImperativeHandle(navigationRef, () => turn);
  useReaderSwipe(panel, { dismiss: onExit, turnPage: turn, turnHorizontal: onHymnSwipe });

  useLayoutEffect(() => {
    const element = viewport.current;
    const measure = probe.current;
    if (!element || !measure) return;
    const update = () => setLayout(measurePages(lyrics, measure, element.clientHeight));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    document.fonts?.addEventListener('loadingdone', update);
    return () => {
      observer.disconnect();
      document.fonts?.removeEventListener('loadingdone', update);
    };
  }, [lyrics, size]);

  useLayoutEffect(() => {
    if (viewport.current) viewport.current.scrollTop = 0;
  }, [pageIndex]);

  return (
    <div className="lyric-panel focus-lyrics" dir={layout.direction} ref={panel} data-reader-swipe>
      {onSizeChange && (
        <div className="lyric-zoom" role="group" aria-label="Lyric zoom">
          <button
            className="button secondary reader-icon-button"
            type="button"
            aria-label="Zoom out lyrics"
            disabled={sizeIndex === 0}
            onClick={() => onSizeChange(sizes[sizeIndex - 1])}
          >
            −
          </button>
          <button
            className="button secondary reader-icon-button"
            type="button"
            aria-label="Zoom in lyrics"
            disabled={sizeIndex === sizes.length - 1}
            onClick={() => onSizeChange(sizes[sizeIndex + 1])}
          >
            +
          </button>
        </div>
      )}
      <div ref={viewport} className="lyric-pages">
        <div className="hymn-lyrics preserve-lines" data-text-size={size}>
          {lyrics.slice(layout.starts[pageIndex], layout.starts[pageIndex + 1])}
        </div>
        <div
          ref={probe}
          aria-hidden="true"
          className="hymn-lyrics preserve-lines lyric-measure"
          data-text-size={size}
        />
      </div>
      <nav className="lyric-pagination" aria-label="Lyric pages" dir="ltr">
        <button
          className="button secondary"
          type="button"
          aria-label="Previous lyrics page"
          aria-disabled={pageIndex === 0}
          onClick={() => turn(-1)}
        >
          ‹
        </button>
        <span className="lyric-page-count" aria-live="polite" aria-atomic="true">
          Page {pageIndex + 1} / {layout.starts.length}
        </span>
        <button
          className="button secondary"
          type="button"
          aria-label="Next lyrics page"
          aria-disabled={pageIndex === layout.starts.length - 1}
          onClick={() => turn(1)}
        >
          ›
        </button>
      </nav>
    </div>
  );
}
