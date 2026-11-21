import type { Hymn } from '../../api/library';

export function HymnMusicalSummary({
  hymn,
  showLanguage = false,
}: {
  hymn: Hymn;
  showLanguage?: boolean;
}) {
  const voices = hymn.is_polyphonic ? hymn.voices.length || '-' : 1;
  return (
    <span className="hymn-musical-summary" aria-label="Musical details">
      {showLanguage && <bdi>{hymn.language.name}</bdi>}
      <span>
        Key{' '}
        <strong>
          <bdi>{hymn.default_key || '—'}</bdi>
        </strong>
      </span>
      <span>
        Tempo{' '}
        <strong>
          <bdi>{hymn.tempo || '—'}</bdi>
        </strong>
      </span>
      <span>
        Voices <strong>{voices}</strong>
      </span>
      {showLanguage && !hymn.is_active && <span>Inactive hymn retained</span>}
    </span>
  );
}
