/** Same-origin private PDFs, one bounded canvas at a time; no document scripts. */
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

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
  const [rendering, setRendering] = useState(true);
  const fullscreenRoot = useRef<HTMLDivElement>(null);
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
  function openFullscreen() {
    // Commit the target before requesting the browser API, within the click gesture.
    flushSync(() => {
      setRendering(true);
      setExpanded(true);
      setControlsVisible(true);
    });
    try {
      void fullscreenRoot.current?.requestFullscreen?.().catch(() => {});
    } catch {
      /* The viewport dialog remains available when native fullscreen is blocked. */
    }
  }
  useEffect(() => {
    if (!expanded) return;
    const root = fullscreenRoot.current;
    let entered = false;
    const change = () => {
      if (document.fullscreenElement === root) entered = true;
      else if (entered) {
        setRendering(true);
        setExpanded(false);
      }
    };
    document.addEventListener('fullscreenchange', change);
    return () => {
      document.removeEventListener('fullscreenchange', change);
      if (root && document.fullscreenElement === root)
        void document.exitFullscreen().catch(() => {});
    };
  }, [expanded]);
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
    if (!pdfDocument || !size.width || !size.height || !canvas) return;
    let active = true;
    let cancel: (() => void) | undefined;
    const target = canvas;
    setRendering(true);
    void (async () => {
      try {
        const pdfPage = await pdfDocument.getPage(page);
        if (!active) return;
        const original = pdfPage.getViewport({ scale: 1 });
        const widthScale = size.width / original.width;
        const fitScale =
          fit === 'height' ? Math.min(widthScale, size.height / original.height) : widthScale;
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
  }, [pdfDocument, page, size, fit, zoom, onFailure, canvas]);
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
            onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
          >
            −
          </button>
          <output aria-label="Zoom relative to fit">{Math.round(zoom * 100)}%</output>
          <button
            className="button secondary"
            aria-label="Zoom in"
            disabled={zoom >= 3}
            onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
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
          onTouchStart={(event) => {
            if (expanded || zoom > 1) event.stopPropagation();
          }}
          onTouchMove={(event) => {
            if (expanded || zoom > 1) event.stopPropagation();
            // A second finger cancels page navigation; pinch/vertical pan remain native.
            if (event.touches.length !== 1) pointer.current = null;
          }}
          onTouchEnd={(event) => {
            if (expanded || zoom > 1) event.stopPropagation();
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
    <Dialog.Root
      open={expanded}
      onOpenChange={(open) => {
        setRendering(true);
        setExpanded(open);
      }}
    >
      {!expanded && (
        <div className="pdf-sheet" data-controls-visible="true">
          {content}
        </div>
      )}
      <Dialog.Portal>
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
              onTouchStart={(event) => event.stopPropagation()}
              onTouchMove={(event) => event.stopPropagation()}
              onTouchEnd={(event) => event.stopPropagation()}
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
