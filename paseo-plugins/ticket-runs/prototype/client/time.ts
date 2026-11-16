const UTC8_MS = 8 * 3_600_000;
const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Clock time in UTC+8, 24 h: "15:10", or "13 Nov 15:10" when the day differs from today's. */
export function clock(iso: string, nowMs: number): string {
  const ms = Date.parse(iso) + UTC8_MS;
  const shifted = new Date(ms);
  const time = `${two(shifted.getUTCHours())}:${two(shifted.getUTCMinutes())}`;
  const sameDay = Math.floor(ms / DAY_MS) === Math.floor((nowMs + UTC8_MS) / DAY_MS);
  return sameDay ? time : `${shifted.getUTCDate()} ${MONTHS[shifted.getUTCMonth()]} ${time}`;
}

/** Elapsed time since `iso`: "12 min", "3 h", "2 d". */
export function elapsed(iso: string, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / (24 * 60))} d`;
}

/** A span of minutes in words: "10 minutes", "1 hour". With `short`: "10 min", "1 h". */
export function span(minutes: number, short = false): string {
  const hours = minutes / 60;
  if (Number.isInteger(hours)) return short ? `${hours} h` : `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return short ? `${minutes} min` : `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}
