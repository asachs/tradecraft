/**
 * Date utilities — ISO week windows, working-day logic.
 * ZERO external dependencies. Every function accepts an injectable `now`.
 */

/** Return a Date set to midnight UTC for the given YYYY-MM-DD string. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Format a Date as YYYY-MM-DD (UTC). */
export function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO day of week: Monday=1, Sunday=7. */
export function isoDayOfWeek(d: Date): number {
  const dow = d.getUTCDay(); // 0=Sun
  return dow === 0 ? 7 : dow;
}

/**
 * Return the Mon-Sun ISO week window [start, end) containing `date`.
 * Both returned as YYYY-MM-DD strings (UTC).
 */
export function isoWeekWindow(date: Date): { start: string; end: string } {
  const day = isoDayOfWeek(date); // 1=Mon..7=Sun
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - (day - 1));
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  return { start: formatDate(monday), end: formatDate(nextMonday) };
}

/**
 * "Today" window: [date, date+1) as YYYY-MM-DD strings.
 */
export function todayWindow(now: Date): { start: string; end: string } {
  const next = new Date(now);
  next.setUTCDate(now.getUTCDate() + 1);
  return { start: formatDate(now), end: formatDate(next) };
}

/**
 * "Yesterday" window, using working-day logic:
 * Monday's "yesterday" is the preceding Friday.
 * Otherwise it's the calendar day before.
 */
export function yesterdayWindow(now: Date): { start: string; end: string } {
  const day = isoDayOfWeek(now);
  const offset = day === 1 ? 3 : 1; // Monday → go back 3 days to Friday
  const yesterday = new Date(now);
  yesterday.setUTCDate(now.getUTCDate() - offset);
  const dayAfter = new Date(yesterday);
  dayAfter.setUTCDate(yesterday.getUTCDate() + 1);
  return { start: formatDate(yesterday), end: formatDate(dayAfter) };
}

/**
 * "Next week" window: the Mon-Sun week after the one containing `date`.
 */
export function nextWeekWindow(date: Date): { start: string; end: string } {
  const { end } = isoWeekWindow(date); // end of current week = start of next
  const nextMon = parseDate(end);
  const nextSun = new Date(nextMon);
  nextSun.setUTCDate(nextMon.getUTCDate() + 7);
  return { start: formatDate(nextMon), end: formatDate(nextSun) };
}
