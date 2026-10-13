/** Step one creates a draft only after its details and duplicate-date check.
 * A failed check retains the form and prevents creation; multiple services on a
 * date remain allowed after explicit confirmation. Step two owns hymn autosave.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { createMass, fetchMasses } from '../api/masses';
import { useSession } from '../features/auth/SessionProvider';
import { useCategories } from '../features/hymns/queries';
import { nearestSunday } from '../features/masses/calendar';
import { MassDateFields } from '../features/masses/MassDateFields';

export function NewMassPage() {
  const categories = useCategories();
  const { user } = useSession();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [newDate, setNewDate] = useState(nearestSunday);
  const [newSeason, setNewSeason] = useState<number | null>(null);
  const [calendarPending, setCalendarPending] = useState(false);
  const changeDate = useCallback((day: string, season: number | null) => {
    setNewDate(day);
    setNewSeason(season);
  }, []);
  if (user?.role === 'Viewer') return <Navigate to="/masses" replace />;
  return (
    <div className="mass-creation">
      <Link className="text-button" to="/masses">
        ← Mass plans
      </Link>
      <h1 className="page-title">Create a Mass</h1>
      <form
        id="create-mass"
        className="form-section"
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending || calendarPending) return;
          const data = new FormData(event.currentTarget);
          setPending(true);
          setFailure(null);
          try {
            const existing = await fetchMasses(
              new URLSearchParams({ from: newDate, to: newDate }).toString(),
            );
            if (
              existing.count &&
              !window.confirm(
                `${existing.count} Mass plan${existing.count === 1 ? ' already exists' : 's already exist'} for ${newDate}. Create another Mass for this date?`,
              )
            )
              return;
            const saved = await createMass({
              date: String(data.get('date')),
              title: String(data.get('title')).trim() || null,
              notes: String(data.get('notes')).trim() || null,
              liturgical_season_id: data.get('season') ? Number(data.get('season')) : null,
            });
            void client.invalidateQueries({ queryKey: ['masses'] });
            navigate(`/masses/${saved.id}/edit`);
          } catch (error) {
            setFailure(error instanceof Error ? error.message : 'Unable to create Mass.');
          } finally {
            setPending(false);
          }
        }}
      >
        <p className="flow-step">Step 1 of 2 · Mass details</p>
        <fieldset disabled={pending} className="form-grid">
          <legend className="sr-only">Mass details</legend>
          <MassDateFields
            date={newDate}
            season={newSeason}
            seasons={categories.data?.['liturgical-seasons'] ?? []}
            initialSuggestion
            onChange={changeDate}
            onPending={setCalendarPending}
          />
          <details className="optional-details planner-details">
            <summary>Title and notes (optional)</summary>
            <div className="form-grid mass-notes-grid">
              <label className="field">
                Title
                <input
                  name="title"
                  maxLength={255}
                  placeholder="Leave blank for a date-based title"
                  dir="auto"
                />
              </label>
              <label className="field">
                Notes
                <textarea name="notes" dir="auto" />
              </label>
            </div>
          </details>
        </fieldset>
        {categories.error && (
          <p className="notice error" role="alert">
            Season choices could not refresh. You can add a season later.
          </p>
        )}
        {failure && (
          <p className="notice error" role="alert">
            {failure} Your input has been kept.
          </p>
        )}
        <div className="form-actions">
          <button className="button primary" disabled={pending || calendarPending}>
            {pending ? 'Creating…' : 'Next'}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={() => navigate('/masses')}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
