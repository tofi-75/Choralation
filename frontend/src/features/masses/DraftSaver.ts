/** Own the working copy and serialize metadata/program writes with a shared revision.
 * New-row acknowledgements attach IDs by local identity, never replace newer edits.
 * Failures stop automatic writes until retry; conflicts require explicit reload/review.
 */
import type { Category, Hymn } from '../../api/library';
import { saveMass, saveProgram } from '../../api/masses';
import type { Mass, MassMetadata, Program, SelectionInput } from '../../api/masses';

export type DraftRow = {
  key: string;
  id?: number;
  placement_id: number;
  hymn: Hymn;
  notes: string;
};
export type Draft = { metadata: MassMetadata; rows: DraftRow[] };
export type SaveState = {
  draft: Draft;
  status: 'Saved' | 'Unsaved' | 'Saving' | 'Unable to save';
  error: Error | null;
  revision: number;
};
type Transport = { metadata: typeof saveMass; program: typeof saveProgram };

export function draftFromMass(mass: Mass): Draft {
  return {
    metadata: {
      date: mass.date,
      title: mass.title,
      notes: mass.notes,
      liturgical_season_id: mass.liturgical_season?.id ?? null,
    },
    rows: mass.program.map((row) => ({
      key: `saved-${row.id}`,
      id: row.id,
      placement_id: row.placement.id,
      hymn: row.hymn,
      notes: row.notes ?? '',
    })),
  };
}
function metadataPayload(draft: Draft): MassMetadata {
  return {
    ...draft.metadata,
    title: draft.metadata.title?.trim() || null,
    notes: draft.metadata.notes?.trim() || null,
  };
}
export function programPayload(rows: DraftRow[]): SelectionInput[] {
  const positions = new Map<number, number>();
  return rows.map((row) => {
    const position = positions.get(row.placement_id) ?? 0;
    positions.set(row.placement_id, position + 1);
    return {
      ...(row.id ? { id: row.id } : {}),
      placement_id: row.placement_id,
      hymn_id: row.hymn.id,
      position,
      notes: row.notes.trim() || null,
    };
  });
}
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export class DraftSaver {
  state: SaveState;
  private version = 0;
  private acknowledged = 0;
  private savedMetadata: MassMetadata;
  private savedRows: SelectionInput[];
  private running = false;
  private inFlight: Promise<void> | undefined;
  private active = true;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listener: (() => void) | undefined;
  private placements = new Map<number, Category>();

  constructor(
    private mass: Mass,
    private transport: Transport = { metadata: saveMass, program: saveProgram },
  ) {
    const draft = draftFromMass(mass);
    this.state = { draft, status: 'Saved', error: null, revision: mass.revision };
    this.savedMetadata = metadataPayload(draft);
    this.savedRows = programPayload(draft.rows);
    for (const row of mass.program) this.placements.set(row.placement.id, row.placement);
  }
  /** Subscribe on mount; stop queued work on unmount while allowing in-flight settlement. */
  subscribe(listener: () => void) {
    this.active = true;
    this.listener = listener;
    return () => {
      this.active = false;
      this.listener = undefined;
      clearTimeout(this.timer);
    };
  }
  private publish(patch: Partial<SaveState>) {
    this.state = { ...this.state, ...patch };
    this.listener?.();
  }
  update(draft: Draft) {
    this.version += 1;
    this.publish({
      draft,
      status: this.running ? 'Saving' : this.state.error ? 'Unable to save' : 'Unsaved',
    });
    clearTimeout(this.timer);
    if (!this.running && !this.state.error) this.timer = setTimeout(() => void this.flush(), 600);
  }
  retry() {
    this.publish({ error: null });
    void this.flush();
  }
  /** Refresh live references only; never adopt another writer's program or revision. */
  refreshReferences(program: Mass['program'], placements: Category[] = []) {
    let changed = false;
    for (const placement of [...program.map((row) => row.placement), ...placements]) {
      const previous = this.placements.get(placement.id);
      if (
        (!previous || Date.parse(placement.updated_at) >= Date.parse(previous.updated_at)) &&
        !equal(previous, placement)
      ) {
        this.placements.set(placement.id, placement);
        changed = true;
      }
    }
    const hymns = new Map(program.map((row) => [row.hymn.id, row.hymn]));
    const rows = this.state.draft.rows.map((row) => {
      const hymn = hymns.get(row.hymn.id);
      if (
        hymn &&
        Date.parse(hymn.updated_at) >= Date.parse(row.hymn.updated_at) &&
        !equal(hymn, row.hymn)
      ) {
        changed = true;
        return { ...row, hymn };
      }
      return row;
    });
    if (changed) this.publish({ draft: { ...this.state.draft, rows } });
  }
  /** Advisory warnings follow the local program and its refreshed live references. */
  get programWarnings(): Mass['warnings'] {
    const warnings: Mass['warnings'] = [];
    const repeated = new Map<number, DraftRow[]>();
    const { rows, metadata } = this.state.draft;
    for (const row of rows) {
      repeated.set(row.hymn.id, [...(repeated.get(row.hymn.id) ?? []), row]);
      const codes = [];
      if (!row.hymn.placements.some((placement) => placement.id === row.placement_id))
        codes.push('placement_mismatch');
      if (
        metadata.liturgical_season_id &&
        !row.hymn.is_season_neutral &&
        !row.hymn.seasons.some((season) => season.id === metadata.liturgical_season_id)
      )
        codes.push('season_mismatch');
      if (!row.hymn.is_active || this.placements.get(row.placement_id)?.is_active === false)
        codes.push('inactive_selection');
      warnings.push(
        ...codes.map((code) => ({
          code,
          hymn_id: row.hymn.id,
          selection_ids: row.id ? [row.id] : [],
          placement_id: row.placement_id,
          facts: {},
        })),
      );
    }
    for (const [hymn_id, selections] of repeated) {
      if (selections.length > 1)
        warnings.push({
          code: 'duplicate_hymn',
          hymn_id,
          selection_ids: selections.flatMap((row) => (row.id ? [row.id] : [])),
          facts: { occurrences: selections.length },
        });
    }
    return warnings;
  }
  /** Drain one snapshot at a time, coalescing edits made while an acknowledgement is pending. */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    // Explicit Save draft must await a write already started by autosave.
    // All callers share the drain, including edits coalesced during that write.
    if (this.inFlight) return this.inFlight;
    if (this.state.error || !this.active) return Promise.resolve();
    this.running = true;
    this.inFlight = this.drain().finally(() => {
      this.running = false;
      this.inFlight = undefined;
    });
    return this.inFlight;
  }
  private async drain(): Promise<void> {
    try {
      while (this.acknowledged !== this.version && this.active) {
        const version = this.version;
        const snapshot = this.state.draft;
        this.publish({ status: 'Saving' });
        const metadata = metadataPayload(snapshot);
        if (!equal(metadata, this.savedMetadata)) {
          const saved = await this.transport.metadata(this.mass.id, this.state.revision, metadata);
          const canonical = draftFromMass(saved);
          this.savedMetadata = metadataPayload(canonical);
          const current = this.state.draft.metadata;
          const acknowledged = <K extends keyof MassMetadata>(field: K): MassMetadata[K] =>
            current[field] === snapshot.metadata[field]
              ? canonical.metadata[field]
              : current[field];
          this.refreshReferences(saved.program);
          this.publish({
            revision: saved.revision,
            draft: {
              ...this.state.draft,
              metadata: {
                date: acknowledged('date'),
                title: acknowledged('title'),
                notes: acknowledged('notes'),
                liturgical_season_id: acknowledged('liturgical_season_id'),
              },
            },
          });
        }
        if (!this.active) break;
        const rows = programPayload(snapshot.rows);
        if (!equal(rows, this.savedRows)) {
          const saved: Program = await this.transport.program(
            this.mass.id,
            this.state.revision,
            rows,
          );
          const ids = new Map(
            saved.selections.map((row) => [`${row.placement.id}:${row.position}`, row.id]),
          );
          const byKey = new Map(
            snapshot.rows.map((row, index) => [
              row.key,
              ids.get(`${rows[index].placement_id}:${rows[index].position}`)!,
            ]),
          );
          this.savedRows = rows.map((row, index) => ({
            id: byKey.get(snapshot.rows[index].key),
            ...row,
          }));
          this.refreshReferences(saved.selections);
          this.publish({
            revision: saved.revision,
            draft: {
              ...this.state.draft,
              rows: this.state.draft.rows.map((row) =>
                byKey.has(row.key) ? { ...row, id: byKey.get(row.key) } : row,
              ),
            },
          });
        }
        this.acknowledged = version;
      }
      this.publish({ status: this.acknowledged === this.version ? 'Saved' : 'Unsaved' });
    } catch (error) {
      this.publish({
        status: 'Unable to save',
        error: error instanceof Error ? error : new Error('Unable to save. Your edits are kept.'),
      });
    }
  }
}
