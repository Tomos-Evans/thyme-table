export const MIN = 60_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Parse 'YYYY-MM-DDTHH:mm' as local time. */
export function parseLocal(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

export function toLocalInput(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Thanksgiving (4th Thursday of November) at 4pm, this year or next. */
export function defaultDinner(now = new Date()): string {
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const first = new Date(year, 10, 1).getDay();
    const day = 1 + ((4 - first + 7) % 7) + 21;
    const t = new Date(year, 10, day, 16, 0);
    if (t.getTime() > now.getTime()) return toLocalInput(t.getTime());
  }
  return toLocalInput(now.getTime() + 4 * 60 * MIN);
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const longFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

export const fmtTime = (t: number) => timeFmt.format(t);
export const fmtLongDate = (t: number) => longFmt.format(t);

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** Clock time, prefixed with the weekday when it isn't on the reference day. */
export function fmtWhen(t: number, ref: number): string {
  return sameDay(t, ref) ? fmtTime(t) : `${dayFmt.format(t)} ${fmtTime(t)}`;
}

export function fmtDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${pad(r)}m` : `${h}h`;
}

/** "in 5 min", "12 min ago", "now". */
export function fmtRelative(t: number, now: number): string {
  const diff = t - now;
  const mins = Math.round(Math.abs(diff) / MIN);
  if (mins === 0) return 'now';
  return diff > 0 ? `in ${fmtDuration(mins)}` : `${fmtDuration(mins)} ago`;
}

/** "4m 09s" or "1h 05m" countdown. */
export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h ${pad(m)}m` : `${m}m ${pad(sec)}s`;
}
