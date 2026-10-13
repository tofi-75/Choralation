/** Only an explicitly different season merits a notice. Any-season classification
 * takes precedence over retained season links; absent legacy classification is
 * unknown, not evidence of a different season. It is not random-pick eligibility.
 */
import type { Hymn } from '../../api/library';
export function hasSeasonMismatch(hymn: Hymn, season: number | null): boolean {
  return Boolean(
    season &&
    !hymn.is_season_neutral &&
    hymn.seasons.length &&
    !hymn.seasons.some((row) => row.id === season),
  );
}
export function seasonLabel(hymn: Hymn): string {
  return hymn.is_season_neutral
    ? 'Any season'
    : hymn.seasons
        .map((row) => row.name)
        .sort()
        .join(', ') || 'Season not specified';
}
