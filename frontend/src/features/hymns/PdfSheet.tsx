/** Same-origin private PDFs, one bounded canvas at a time; no document scripts. */
import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useReaderFullscreen } from './useReaderFullscreen';
import { useReaderSwipe } from './useReaderSwipe';

GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfFit = 'height' | 'width';

export default function PdfSheet({
  url,
  title,
  onFailure,
  focus = false,
  fit: preferredFit,
  onFitChange,
}: {
  url: string;
  title: string;
  onFailure: () => void;
  focus?: boolean;
  fit?: PdfFit;
  onFitChange?: (fit: PdfFit) => void;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [portalContainer, setPortalContainer] = useState<Element | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [localFit, setLocalFit] = useState<PdfFit>('height');
  const fit = preferredFit ?? localFit;
  const setFit = (value: PdfFit) => {
    setLocalFit(value);
    onFitChange?.(value);
  };
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideControls = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pointer = useRef<{ x: number; y: number; id: number } | null>(null);
  function revealControls() {
    setControlsVisible(true);
    clearTimeout(hideControls.current);
    hideControls.current = setTimeout(() => setControlsVisible(false), 2600);
  }
  useEffect(() => () => clearTimeout(hideControls.current), []);
  useEffect(() => {
    if (!expanded) return;
    setControlsVisible(true);
    hideControls.current = setTimeout(() => setControlsVisible(false), 2600);
    return () => clearTimeout(hideControls.current);
  }, [expanded]);
  const [zoom, setZoom] = useState(1);
  const [zoomReference, setZoomReference] = useState<typeof size | null>(null);
  const phoneFocus = focus && window.matchMedia?.('(any-pointer: coarse)').matches;
  const fitSize = zoomReference ?? size;

  function changeZoom(delta: number) {
    const next = Math.max(0.5, Math.min(3, zoom + delta));
    if (phoneFocus && size.width && size.height) {
      // Keep the rendered scale while zoomed, even when rotation resizes the viewport.
      setZoomReference(next === 1 ? null : (zoomReference ?? size));
    }
    setZoom(next);
  }

  const applyOrientationFit = useEffectEvent((landscape: boolean) => {
    if (zoom === 1 && (window.visualViewport?.scale ?? 1) <= 1.01) {
      setFit(landscape ? 'width' : 'height');
    }
  });
  useEffect(() => {
    if (!phoneFocus) return;
    const orientation = window.matchMedia('(orientation: landscape)');
    const rotate = (event: MediaQueryListEvent) => applyOrientationFit(event.matches);
    orientation.addEventListener('change', rotate);
    return () => orientation.removeEventListener('change', rotate);
  }, [phoneFocus]);
  const [rendering, setRendering] = useState(true);
  const changeExpanded = useCallback((open: boolean) => {
    setRendering(true);
    setExpanded(open);
  }, []);
  const closeFullscreen = useCallback(() => changeExpanded(false), [changeExpanded]);
  const swipe = useReaderSwipe({ dismiss: closeFullscreen, isolate: true });
  const { rootRef: fullscreenRoot, requestFullscreen } = useReaderFullscreen(
    expanded,
    closeFullscreen,
  );
  const previewButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const ignoreClickUntil = useRef(0);
  const sideNavigation = expanded || focus;
  const hasPages = Boolean(pdfDocument && pdfDocument.numPages > 1);
  const canSwipePages = expanded && zoom <= 1;
  function movePage(delta: number) {
    if (!pdfDocument) return;
    const next = Math.max(1, Math.min(pdfDocument.numPages, page + delta));
    if (next !== page) {
      setRendering(true);
      setPage(next);
    }
  }
  function pageButton(delta: -1 | 1) {
    const disabled = delta === -1 ? page === 1 : page === pdfDocument?.numPages;
    return (
      <button
        type="button"
        className={`button secondary pdf-side-page ${delta === -1 ? 'pdf-previous' : 'pdf-next'}`}
        // Keep side controls focusable at boundaries for keyboard page navigation.
        disabled={sideNavigation ? undefined : disabled}
        aria-disabled={sideNavigation ? disabled : undefined}
        onClick={() => {
          movePage(delta);
          revealControls();
        }}
        aria-label={delta === -1 ? 'Previous PDF page' : 'Next PDF page'}
      >
        {delta === -1 ? '‹' : '›'}
      </button>
    );
  }
  function openFullscreen(event: MouseEvent<HTMLButtonElement>) {
    const nativeRoot = document.fullscreenElement;
    // Commit the target before requesting the browser API, within the click gesture.
    flushSync(() => {
      // A dialog portaled outside a fullscreen Focus reader would be behind it.
      setPortalContainer(nativeRoot?.contains(event.currentTarget) ? nativeRoot : null);
      changeExpanded(true);
      setControlsVisible(true);
    });
    requestFullscreen();
  }
  useEffect(() => {
    const element = container;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [container]);
  useEffect(() => {
    let active = true;
    const task = getDocument({
      url,
      withCredentials: true,
      cMapUrl: '/assets/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/assets/pdfjs/standard_fonts/',
      wasmUrl: '/assets/pdfjs/wasm/',
      useSystemFonts: true,
    });
    void task.promise
      .then((pdf) => {
        if (active) setPdfDocument(pdf);
      })
      .catch(() => {
        if (active) onFailure();
      });
    return () => {
      active = false;
      void task.destroy();
    };
  }, [url, onFailure]);
  useEffect(() => {
    if (!pdfDocument || !fitSize.width || !fitSize.height || !canvas) return;
    let active = true;
    let cancel: (() => void) | undefined;
    const target = canvas;
    setRendering(true);
    void (async () => {
      try {
        const pdfPage = await pdfDocument.getPage(page);
        if (!active) return;
        const original = pdfPage.getViewport({ scale: 1 });
        const widthScale = fitSize.width / original.width;
        const fitScale =
          fit === 'height' ? Math.min(widthScale, fitSize.height / original.height) : widthScale;
        const scale = fitScale * zoom;
        const viewport = pdfPage.getViewport({ scale });
        // Bound memory on high-density phones and unusually tall pages.
        const ratio = Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(8000000 / (viewport.width * viewport.height)),
        );
        target.width = Math.floor(viewport.width * ratio);
        target.height = Math.floor(viewport.height * ratio);
        target.style.width = `${viewport.width}px`;
        target.style.height = `${viewport.height}px`;
        const render = pdfPage.render({
          canvas: target,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        });
        cancel = () => render.cancel();
        await render.promise;
        if (active) setRendering(false);
      } catch {
        if (active) onFailure();
      }
    })();
    return () => {
      active = false;
      cancel?.();
    };
  }, [pdfDocument, page, fitSize, fit, zoom, onFailure, canvas]);
  useEffect(() => {
    if (container) {
      container.scrollTop = 0;
      container.scrollLeft = 0;
    }
  }, [container, page, fit]);
  const content = (
    <>
      <div
        className="pdf-toolbar"
        role="toolbar"
        aria-label="PDF controls"
        onPointerDown={revealControls}
      >
        <div className="pdf-zoom" role="group" aria-label="PDF zoom">
          <button
            className="button secondary"
            aria-label="Zoom out"
            disabled={zoom <= 0.5}
            onClick={() => changeZoom(-0.25)}
          >
            −
          </button>
          <output aria-label="Zoom relative to fit">{Math.round(zoom * 100)}%</output>
          <button
            className="button secondary"
            aria-label="Zoom in"
            disabled={zoom >= 3}
            onClick={() => changeZoom(0.25)}
          >
            +
          </button>
          <button
            className="button secondary pdf-fit"
            aria-label={fit === 'height' ? 'Fit to width' : 'Fit to height'}
            title={fit === 'height' ? 'Fit to width' : 'Fit to length (whole page)'}
            onClick={() => {
              setFit(fit === 'height' ? 'width' : 'height');
              setZoom(1);
              setZoomReference(null);
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="5" y="3" width="14" height="18" rx="1" />
              {fit === 'height' ? (
                <path d="M2 12h20M5 9l-3 3 3 3m14-6 3 3-3 3" />
              ) : (
                <path d="M12 1v22M9 4l3-3 3 3M9 20l3 3 3-3" />
              )}
            </svg>
          </button>
        </div>
        {pdfDocument && (
          <span className="pdf-page-count" aria-live="polite" aria-atomic="true">
            Page {page} / {pdfDocument.numPages}
          </span>
        )}
        <a
          className="button secondary"
          href={url}
          download
          aria-label="Download PDF"
          title="Download PDF"
        >
          ↓
        </a>
        {expanded ? (
          <Dialog.Close
            ref={closeButton}
            className="button secondary"
            aria-label="Exit PDF fullscreen"
            title="Exit fullscreen"
          >
            ✕
          </Dialog.Close>
        ) : (
          <button
            className="button secondary"
            onClick={openFullscreen}
            aria-label="Fullscreen"
            title="Fullscreen"
          >
            ⛶
          </button>
        )}
      </div>
      <div
        className={`pdf-reader ${sideNavigation && hasPages ? 'pdf-reader-with-navigation' : ''}`}
        onKeyDown={(event) => {
          if (!sideNavigation || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
            return;
          if (
            !expanded &&
            event.target !== container &&
            !(event.target instanceof Element && event.target.closest('.pdf-side-page'))
          )
            return;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            event.stopPropagation();
            movePage(event.key === 'ArrowRight' ? 1 : -1);
          }
        }}
      >
        {hasPages && pageButton(-1)}
        <div
          className="pdf-viewport"
          data-page-swipes={canSwipePages}
          data-zoomed={zoom > 1}
          ref={setContainer}
          aria-busy={rendering}
          tabIndex={0}
          role="region"
          aria-label="Sheet music viewport"
          onPointerDown={(event) => {
            if (!canSwipePages || event.pointerType === 'mouse') return;
            if (!event.isPrimary) {
              pointer.current = null;
              return;
            }
            pointer.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            const start = pointer.current;
            pointer.current = null;
            if (!start || start.id !== event.pointerId || !canSwipePages) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.4) {
              ignoreClickUntil.current = performance.now() + 500;
              movePage(dx < 0 ? 1 : -1);
              revealControls();
            }
          }}
          onPointerCancel={() => {
            pointer.current = null;
          }}
          onTouchMove={(event) => {
            // A second finger cancels page navigation; pinch/vertical pan remain native.
            if (event.touches.length !== 1) pointer.current = null;
          }}
          onClick={(event) => {
            const viewport = event.currentTarget;
            if (
              !canSwipePages ||
              performance.now() < ignoreClickUntil.current ||
              viewport.scrollWidth > viewport.clientWidth + 1
            )
              return;
            revealControls();
            const box = viewport.getBoundingClientRect();
            const position = (event.clientX - box.left) / box.width;
            if (position < 1 / 3) movePage(-1);
            else if (position > 2 / 3) movePage(1);
          }}
        >
          {rendering && (
            <p className="pdf-loading" role="status">
              Loading sheet music…
            </p>
          )}
          <div className="pdf-page-frame">
            {expanded ? (
              <canvas
                ref={setCanvas}
                role="img"
                aria-label={`${title}, sheet music page ${page}`}
              />
            ) : (
              <button
                className="pdf-preview"
                ref={previewButton}
                onClick={openFullscreen}
                aria-label={`Open ${title} PDF fullscreen`}
              >
                <canvas
                  ref={setCanvas}
                  role="img"
                  aria-label={`${title}, sheet music page ${page}`}
                />
              </button>
            )}
          </div>
        </div>
        {hasPages && pageButton(1)}
      </div>
    </>
  );
  return (
    <Dialog.Root open={expanded} onOpenChange={changeExpanded}>
      {!expanded && (
        <div className="pdf-sheet" data-controls-visible="true">
          {content}
        </div>
      )}
      <Dialog.Portal container={portalContainer}>
        {expanded && (
          <>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content
              className="pdf-fullscreen"
              ref={fullscreenRoot}
              aria-describedby={undefined}
              data-controls-visible={controlsVisible}
              onPointerMove={(event) => {
                if (event.pointerType === 'mouse') revealControls();
              }}
              onClick={revealControls}
              onFocusCapture={revealControls}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                fullscreenRoot.current?.querySelector<HTMLElement>('.pdf-viewport')?.focus();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                previewButton.current?.focus();
              }}
              onEscapeKeyDown={(event) => event.stopPropagation()}
              {...swipe}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (!pdfDocument || event.altKey || event.ctrlKey || event.metaKey) return;
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                  event.preventDefault();
                  movePage(event.key === 'ArrowRight' ? 1 : -1);
                }
              }}
            >
              <Dialog.Title className="sr-only">{title} · PDF</Dialog.Title>
              <div className="pdf-sheet pdf-fullscreen-reading">{content}</div>
            </Dialog.Content>
          </>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
