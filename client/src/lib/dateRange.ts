// Date windows for the admin filters, as the 'YYYY-MM-DD' strings the API
// expects. Everything is computed in Vietnamese local time: the server runs in
// UTC, so at 06:00 Hanoi "hôm nay" in UTC is still yesterday's date, and the
// today-preset would quietly return the wrong day's orders.

const VN_OFFSET_MS = 7 * 3600 * 1000;

export type DayRange = { from: string; to: string };

function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayVn(): string {
  return toDay(new Date(Date.now() + VN_OFFSET_MS));
}

export function shiftDays(day: string, delta: number): string {
  return toDay(new Date(new Date(`${day}T00:00:00Z`).getTime() + delta * 86400000));
}

export function lastNDays(n: number): DayRange {
  const to = todayVn();
  return { from: shiftDays(to, -(n - 1)), to };
}

export function monthRange(monthsAgo = 0): DayRange {
  const now = new Date(Date.now() + VN_OFFSET_MS);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 0));
  return { from: toDay(start), to: toDay(end) };
}

export const RANGE_PRESETS: { key: string; label: string; range: () => DayRange }[] = [
  { key: "today", label: "Hôm nay", range: () => lastNDays(1) },
  { key: "7d", label: "7 ngày", range: () => lastNDays(7) },
  { key: "30d", label: "30 ngày", range: () => lastNDays(30) },
  { key: "90d", label: "90 ngày", range: () => lastNDays(90) },
  { key: "month", label: "Tháng này", range: () => monthRange(0) },
  { key: "lastMonth", label: "Tháng trước", range: () => monthRange(1) },
];

/** Which preset (if any) a hand-picked window happens to match, for highlighting. */
export function matchPreset(range: DayRange): string | null {
  return RANGE_PRESETS.find((p) => {
    const r = p.range();
    return r.from === range.from && r.to === range.to;
  })?.key ?? null;
}

/** "26/09/2026" or "01/09 – 26/09/2026" for a heading. */
export function formatRange({ from, to }: DayRange): string {
  const short = (day: string) => day.slice(8, 10) + "/" + day.slice(5, 7);
  const year = to.slice(0, 4);
  if (from === to) return `${short(from)}/${year}`;
  return `${short(from)} – ${short(to)}/${year}`;
}
