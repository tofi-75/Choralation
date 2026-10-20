/** Shared reading surface: private PDF first, then lyrics, then the hymn title. */
import { lazy, Suspense, useCallback, useState } from 'react';
import type { Hymn } from '../../api/library';

const PdfSheet = lazy(() => import('./PdfSheet'));

export function HymnMaterial({ hymn, focus = false }: { hymn: Hymn; focus?: boolean }) {
  const [failed, setFailed] = useState(false);
  const onFailure = useCallback(() => setFailed(true), []);
  return (
    <section
      className={`hymn-material ${focus ? 'focus-material' : ''}`}
      aria-label="Performance material"
    >
      {hymn.sheet_music_pdf && !failed ? (
        <Suspense fallback={<p role="status">Loading sheet music…</p>}>
          <PdfSheet url={hymn.sheet_music_pdf.url} title={hymn.title} onFailure={onFailure} />
        </Suspense>
      ) : (
        <>
          {failed && (
            <p className="material-error" role="alert">
              Sheet music could not be displayed.{' '}
              <a className="text-button" href={hymn.sheet_music_pdf?.url}>
                Try downloading the PDF
              </a>{' '}
              or{' '}
              <button className="text-button" onClick={() => setFailed(false)}>
                retry preview
              </button>
              .
            </p>
          )}
          {hymn.lyrics ? (
            <div className="hymn-lyrics preserve-lines" dir="auto">
              {hymn.lyrics}
            </div>
          ) : focus ? (
            <p className="focus-title-only" dir="auto">
              {hymn.title}
            </p>
          ) : (
            <p className="muted">No PDF or lyrics added yet.</p>
          )}
        </>
      )}
      {!focus && hymn.sheet_music_pdf && !failed && hymn.lyrics && (
        <div className="hymn-lyrics preserve-lines" dir="auto">
          {hymn.lyrics}
        </div>
      )}
      {hymn.sheet_music_url && (
        <a
          className="text-button external-score"
          href={hymn.sheet_music_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open sheet music link ↗
        </a>
      )}
    </section>
  );
}
