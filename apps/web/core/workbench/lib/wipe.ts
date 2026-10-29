/**
 * The server wipe calendar: every second Thursday, starting Thursday 29 Oct 2026, the same
 * schedule as the Thesys map. A wipe "happens" at 00:00 local time on its Thursday.
 */
export const WIPE_EPOCH = new Date(2026, 9, 29); // local midnight, Thu 29 Oct 2026
export const WIPE_DAYS = 14;
const DAY = 86_400_000;

/** The wipe in progress: its number (1 = the one that started on the epoch) and dates. */
export function currentWipe(now = new Date()): { number: number; start: Date; end: Date } {
  // count whole local days so DST changes don't shift the boundary
  const days = Math.floor((startOfDay(now).getTime() - WIPE_EPOCH.getTime()) / DAY + 0.5);
  const n = Math.floor(days / WIPE_DAYS);
  const start = addDays(WIPE_EPOCH, n * WIPE_DAYS);
  return { number: n + 1, start, end: addDays(start, WIPE_DAYS) };
}

/** "3D 4H", "4H 12M", "12M" — Rust style, two units at most. */
export function leftText(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d) return `${d}D ${h}H`;
  if (h) return `${h}H ${mm}M`;
  return `${mm}M`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
