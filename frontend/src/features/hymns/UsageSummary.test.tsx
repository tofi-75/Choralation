/** Scheduled usage must never become negative "days ago" text. */
import { expect, it } from 'vitest';
import { usageDateLabel } from './UsageSummary';

it('uses scheduled wording for future dates with an exact date', () => {
  expect(usageDateLabel('2026-10-11', '2026-10-08')).toBe('Scheduled for Oct 11, 2026');
});
it('handles today and singular/plural relative days across year boundaries', () => {
  expect(usageDateLabel('2026-10-08', '2026-10-08')).toBe('Last selected today');
  expect(usageDateLabel('2025-12-31', '2026-01-01')).toBe('Last selected 1 day ago');
  expect(usageDateLabel('2025-12-30', '2026-01-01')).toBe('Last selected 2 days ago');
});
