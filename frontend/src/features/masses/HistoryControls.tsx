/** Shared date/season/text filters for Mass history and finalized hymn occurrences. */
import { useCategories } from '../hymns/queries';

export function HistoryControls({
  params,
  change,
  status = false,
}: {
  params: URLSearchParams;
  change: (key: string, value: string) => void;
  status?: boolean;
}) {
  const categories = useCategories();
  return (
    <details className="optional-details">
      <summary>History filters</summary>
      <div className="form-grid">
        <label className="field">
          Search title or notes
          <input
            value={params.get('q') ?? ''}
            onChange={(event) => change('q', event.target.value)}
          />
        </label>
        <label className="field">
          From date
          <input
            type="date"
            value={params.get('from') ?? ''}
            onChange={(event) => change('from', event.target.value)}
          />
        </label>
        <label className="field">
          To date
          <input
            type="date"
            value={params.get('to') ?? ''}
            onChange={(event) => change('to', event.target.value)}
          />
        </label>
        <label className="field">
          Season
          <select
            value={params.get('season') ?? ''}
            onChange={(event) => change('season', event.target.value)}
          >
            <option value="">All seasons</option>
            {categories.data?.['liturgical-seasons'].map((season) => (
              <option value={season.id} key={season.id}>
                {season.name}
                {!season.is_active && ' (inactive)'}
              </option>
            ))}
          </select>
        </label>
        {status && (
          <label className="field">
            Status
            <select
              value={params.get('status') ?? 'finalized'}
              onChange={(event) => change('status', event.target.value)}
            >
              <option value="finalized">Finalized only</option>
              <option value="draft">Drafts only</option>
              <option value="all">All plans</option>
            </select>
          </label>
        )}
      </div>
      {categories.error && (
        <p role="alert">
          Unable to refresh season choices.{' '}
          <button className="text-button" onClick={() => void categories.refetch()}>
            Retry seasons
          </button>
        </p>
      )}
    </details>
  );
}

export function HistoryPages({
  next,
  previous,
  page,
  change,
}: {
  next: string | null;
  previous: string | null;
  page: string;
  change: (key: string, value: string) => void;
}) {
  return (
    <nav className="form-actions" aria-label="History pages">
      <button
        className="button secondary"
        disabled={!previous}
        onClick={() => change('page', String(Number(page) - 1))}
      >
        Previous
      </button>
      <span>Page {page}</span>
      <button
        className="button secondary"
        disabled={!next}
        onClick={() => change('page', String(Number(page) + 1))}
      >
        Next
      </button>
    </nav>
  );
}
