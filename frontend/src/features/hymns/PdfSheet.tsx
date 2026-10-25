/** Same-origin private PDFs, one bounded canvas at a time; no document scripts. */
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfSheet({
  url,
  title,
  onFailure,
  focus = false,
}: {
  url: string;
  title: string;
  onFailure: () => void;
  focus?: boolean;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [fit, setFit] = useState<'height' | 'width'>('height');
  const [zoom, setZoom] = useState(1);
  const [rendering, setRendering] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const fullscreenRoot = useRef<HTMLDivElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
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
        className={`button secondary ${sideNavigation ? 'pdf-side-page' : ''}`}
        // Keep side controls focusable at boundaries for keyboard page navigation.
        disabled={sideNavigation ? undefined : disabled}
        aria-disabled={sideNavigation ? disabled : undefined}
        onClick={() => movePage(delta)}
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
      <div className="pdf-toolbar">
        <a className="text-button" href={url} download>
          Download PDF
        </a>
        {!expanded && (
          <button className="text-button" onClick={openFullscreen}>
            Fullscreen ↗
          </button>
        )}
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
            title={`Currently fitted to ${fit}`}
            onClick={() => {
              setFit((value) => (value === 'height' ? 'width' : 'height'));
              setZoom(1);
            }}
          >
            {fit === 'height' ? 'Fit to width' : 'Fit to height'}
          </button>
        </div>
        {hasPages && pdfDocument && (
          <div className="pdf-pages" aria-label="PDF pages">
            {!sideNavigation && pageButton(-1)}
            <span aria-live="polite" aria-atomic="true">
              Page {page} / {pdfDocument.numPages}
            </span>
            {!sideNavigation && pageButton(1)}
          </div>
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
        {sideNavigation && hasPages && pageButton(-1)}
        <div
          className="pdf-viewport"
          data-page-swipes={canSwipePages}
          data-zoomed={zoom > 1}
          ref={setContainer}
          aria-busy={rendering}
          tabIndex={0}
          role="region"
          aria-label="Sheet music viewport"
          onTouchStart={(event) => {
            if (expanded || zoom > 1) event.stopPropagation();
            touch.current =
              canSwipePages &&
              event.touches.length === 1 &&
              event.currentTarget.scrollWidth <= event.currentTarget.clientWidth + 1
                ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
                : null;
          }}
          onTouchMove={(event) => {
            if (expanded || zoom > 1) event.stopPropagation();
            if (event.touches.length !== 1) {
              touch.current = null;
              ignoreClickUntil.current = performance.now() + 500;
            } else if (touch.current) {
              const dx = Math.abs(event.touches[0].clientX - touch.current.x);
              const dy = Math.abs(event.touches[0].clientY - touch.current.y);
              if (Math.max(dx, dy) > 10) ignoreClickUntil.current = performance.now() + 500;
              if (dy > 12 && dy > dx * 1.4) touch.current = null;
            }
          }}
          onTouchEnd={(event) => {
            if (expanded || zoom > 1) event.stopPropagation();
            const start = touch.current;
            touch.current = null;
            if (!start || !canSwipePages || event.changedTouches.length !== 1) return;
            const dx = event.changedTouches[0].clientX - start.x;
            const dy = event.changedTouches[0].clientY - start.y;
            if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
              ignoreClickUntil.current = performance.now() + 500;
              movePage(dx < 0 ? 1 : -1);
            }
          }}
          onTouchCancel={() => {
            touch.current = null;
          }}
          onClick={(event) => {
            const viewport = event.currentTarget;
            if (
              !canSwipePages ||
              performance.now() < ignoreClickUntil.current ||
              viewport.scrollWidth > viewport.clientWidth + 1
            )
              return;
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
        {sideNavigation && hasPages && pageButton(1)}
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
      {!expanded && <div className="pdf-sheet">{content}</div>}
      <Dialog.Portal>
        {expanded && (
          <>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content
              className="pdf-fullscreen"
              ref={fullscreenRoot}
              aria-describedby={undefined}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                closeButton.current?.focus();
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
              <header className="focus-header">
                <Dialog.Title dir="auto">{title} · PDF</Dialog.Title>
                <Dialog.Close
                  ref={closeButton}
                  className="button secondary focus-close"
                  aria-label="Exit PDF fullscreen"
                >
                  ✕
                </Dialog.Close>
              </header>
              <div className="pdf-sheet pdf-fullscreen-reading">{content}</div>
            </Dialog.Content>
          </>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
