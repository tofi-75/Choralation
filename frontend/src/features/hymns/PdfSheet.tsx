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
}: {
  url: string;
  title: string;
  onFailure: () => void;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
  const [rendering, setRendering] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const fullscreenRoot = useRef<HTMLDivElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
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
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
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
    if (!pdfDocument || !width || !canvas) return;
    let active = true;
    let cancel: (() => void) | undefined;
    const target = canvas;
    void (async () => {
      try {
        const pdfPage = await pdfDocument.getPage(page);
        if (!active) return;
        const original = pdfPage.getViewport({ scale: 1 });
        const scale = width / original.width;
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
  }, [pdfDocument, page, width, onFailure, canvas]);
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
        {pdfDocument && pdfDocument.numPages > 1 && (
          <div className="pdf-pages" aria-label="PDF pages">
            <button
              className="button secondary"
              disabled={page === 1}
              onClick={() => {
                setRendering(true);
                setPage(page - 1);
              }}
              aria-label="Previous PDF page"
            >
              ‹
            </button>
            <span>
              Page {page} / {pdfDocument.numPages}
            </span>
            <button
              className="button secondary"
              disabled={page === pdfDocument.numPages}
              onClick={() => {
                setRendering(true);
                setPage(page + 1);
              }}
              aria-label="Next PDF page"
            >
              ›
            </button>
          </div>
        )}
      </div>
      {rendering && <p role="status">Loading sheet music…</p>}
      {expanded ? (
        <canvas ref={setCanvas} role="img" aria-label={`${title}, sheet music page ${page}`} />
      ) : (
        <button
          className="pdf-preview"
          ref={previewButton}
          onClick={openFullscreen}
          aria-label={`Open ${title} PDF fullscreen`}
        >
          <canvas ref={setCanvas} role="img" aria-label={`${title}, sheet music page ${page}`} />
        </button>
      )}
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
        <div className="pdf-sheet" ref={setContainer}>
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
                  const next = Math.max(
                    1,
                    Math.min(pdfDocument.numPages, page + (event.key === 'ArrowRight' ? 1 : -1)),
                  );
                  if (next !== page) {
                    setRendering(true);
                    setPage(next);
                  }
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
              <div className="pdf-sheet pdf-fullscreen-reading" ref={setContainer}>
                {content}
              </div>
            </Dialog.Content>
          </>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
