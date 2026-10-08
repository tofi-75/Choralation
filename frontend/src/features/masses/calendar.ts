/** Date-only defaults use Beirut's calendar day, independent of the device timezone. */
import { z } from 'zod';

import { request } from '../../api/client';

export function nearestSunday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Beirut',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (name: string) => Number(parts.find((item) => item.type === name)!.value);
  const day = new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
  const weekday = day.getUTCDay();
  day.setUTCDate(day.getUTCDate() + (weekday <= 3 ? -weekday : 7 - weekday));
  return day.toISOString().slice(0, 10);
}

const calendarSchema = z.object({
  date: z.string(),
  calendar: z.literal('maronite'),
  season_slug: z.string(),
  season_name: z.string(),
  season_id: z.number().nullable(),
  day_title: z.string().nullable(),
  source: z.enum(['evangelizo', 'local']),
  source_url: z.string(),
});
export function fetchCalendar(day: string) {
  return request(`/calendar/maronite/?date=${encodeURIComponent(day)}`, calendarSchema);
}
