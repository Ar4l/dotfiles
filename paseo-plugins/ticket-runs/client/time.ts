const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Clock time in the device's time zone, 24 h: "15:10", or "13 Nov 15:10" when the day differs from today's. */
export function clock(iso: string, nowMs: number): string {
  const at = new Date(iso);
  const now = new Date(nowMs);
  const time = `${two(at.getHours())}:${two(at.getMinutes())}`;
  const sameDay = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
  return sameDay ? time : `${at.getDate()} ${MONTHS[at.getMonth()]} ${time}`;
}

/** Elapsed time since `iso`: "12 min", "3 h", "2 d". */
export function elapsed(iso: string, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / (24 * 60))} d`;
}
