/** Global finalized selections include scheduled plans; dates use the team day. */
import type { Hymn } from '../../api/library';
import { useChoir } from '../choirs/ChoirProvider';

export function usageDateLabel(day: string, today?: string) {
  const current =
    today ??
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Beirut',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  const difference = Math.round(
    (Date.parse(`${current}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86400000,
  );
  const exact = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00Z`),
  );
  if (difference < 0) return `Scheduled for ${exact}`;
  if (difference === 0) return 'Last selected today';
  return `Last selected ${difference} ${difference === 1 ? 'day' : 'days'} ago`;
}

export function UsageSummary({
  hymn,
  dateFirst = false,
}: {
  hymn: Pick<Hymn, 'usage_count' | 'last_used_date'>;
  dateFirst?: boolean;
}) {
  const { active } = useChoir();
  if (!active) return null;
  const count = (
    <span>
      {hymn.usage_count === 0
        ? 'Never used'
        : `${hymn.usage_count} finalized ${hymn.usage_count === 1 ? 'selection' : 'selections'}`}
    </span>
  );
  const date = hymn.last_used_date && (
    <small className="muted" title={hymn.last_used_date}>
      <time dateTime={hymn.last_used_date}>{usageDateLabel(hymn.last_used_date)}</time> ·{' '}
      {hymn.last_used_date}
    </small>
  );
  return (
    <span className="usage-summary" title={`Usage in ${active.name}`}>
      {dateFirst ? (
        <>
          {date}
          {count}
        </>
      ) : (
        <>
          {count}
          {date}
        </>
      )}
    </span>
  );
}
