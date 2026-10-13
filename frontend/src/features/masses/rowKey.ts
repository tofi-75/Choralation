/** Identity for new rows in this browser session; never used for authentication.
 * Saved rows use server IDs. The module counter prevents local collisions on HTTP
 * origins where randomUUID is unavailable, without changing autosave semantics.
 */
let sequence = 0;
export function newRowKey(): string {
  return `local-${++sequence}`;
}
