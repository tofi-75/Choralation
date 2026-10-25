import { lazy, Suspense, useCallback, useEffect, useState } from 'react';

const PdfSheet = lazy(() => import('./PdfSheet'));

function Preview({ url, title }: { url: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const onFailure = useCallback(() => setFailed(true), []);
  return failed ? (
    <p className="notice" role="alert">
      This PDF is unavailable or could not be read. Select a replacement below; the existing
      attachment stays unchanged until you save.
    </p>
  ) : (
    <Suspense fallback={<p role="status">Loading PDF preview…</p>}>
      <PdfSheet url={url} title={title} onFailure={onFailure} />
    </Suspense>
  );
}

export function PdfAttachmentPreview({
  file,
  existingUrl,
  title,
}: {
  file: File | null;
  existingUrl?: string;
  title: string;
}) {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const url = file ? (preview?.file === file ? preview.url : undefined) : existingUrl;
  return url ? (
    <div className="pdf-edit-preview" aria-label="PDF attachment preview">
      <Preview key={url} url={url} title={title} />
    </div>
  ) : null;
}
