/** Shared reading surface: private PDF first, then lyrics, then the hymn title. */
import { lazy, Suspense, useCallback, useState } from 'react';
import type { PdfFit } from './PdfSheet';
import type { Hymn } from '../../api/library';

const PdfSheet = lazy(() => import('./PdfSheet'));

export function HymnMaterial({
  hymn,
  focus = false,
  fit,
  onFitChange,
  page,
  onPageChange,
  lyricSize,
  onLyricSizeChange,
}: {
  hymn: Hymn;
  focus?: boolean;
  fit?: PdfFit;
  onFitChange?: (fit: PdfFit) => void;
  page?: number;
  onPageChange?: (page: number) => void;
  lyricSize?: string;
  onLyricSizeChange?: (size: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  const onFailure = useCallback(() => setFailed(true), []);
  return (
    <section
      className={`hymn-material ${focus ? 'focus-material' : ''}`}
      aria-label="Performance material"
    >
      {hymn.sheet_music_pdf && !failed ? (
        <Suspense fallback={<p role="status">Loading sheet music…</p>}>
          <PdfSheet
            key={hymn.sheet_music_pdf.url}
            url={hymn.sheet_music_pdf.url}
            title={hymn.title}
            onFailure={onFailure}
            focus={focus}
            fit={fit}
            onFitChange={onFitChange}
            page={page}
            onPageChange={onPageChange}
          />
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
            <>
              {onLyricSizeChange && (
                <label className="field focus-lyric-size">
                  Lyric text size
                  <select
                    value={lyricSize}
                    onChange={(event) => onLyricSizeChange(event.target.value)}
                  >
                    <option value="standard">Standard</option>
                    <option value="large">Large</option>
                    <option value="extra-large">Extra large</option>
                  </select>
                </label>
              )}
              <div className="hymn-lyrics preserve-lines" dir="auto" data-text-size={lyricSize}>
                {hymn.lyrics}
              </div>
            </>
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
