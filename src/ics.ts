import type { PlanEvent, Schedule } from './schedule';
import type { Plan } from './types';
import { MIN } from './time';

const ICON: Record<PlanEvent['type'], string> = { preheat: '🌡️', 'oven-temp': '🌡️', start: '▶️', ready: '✅', dinner: '🍽️' };

const utc = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fold lines to 75 octets as RFC 5545 requires, without splitting a UTF-8 character. */
function fold(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = parts.length ? 74 : 75; // continuation lines start with a space
    if (bytes + n > limit) {
      parts.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

function alarm(minutesBefore: number, description: string): string[] {
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escape(description)}`, `TRIGGER:-PT${minutesBefore}M`, 'END:VALARM'];
}

/** Calendar with one short event (and alarm) per upcoming action. */
export function buildIcs(plan: Plan, schedule: Schedule, now: number): string {
  const stamp = utc(now);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Thyme Table//Dinner plan//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Thyme Table'];
  for (const e of schedule.events) {
    if (e.time < now || plan.done[e.id]) continue;
    const summary = e.type === 'dinner' ? `${ICON[e.type]} ${e.title}` : `${ICON[e.type]} ${e.title}: ${e.subject.replace(/^For /, 'for ')}`;
    const end = e.type === 'start' && e.until && e.until > e.time ? Math.min(e.until, e.time + 5 * MIN) : e.time + 5 * MIN;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id.replace(/[^\w:-]/g, '')}@thyme-table`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utc(e.time)}`,
      `DTEND:${utc(end)}`,
      `SUMMARY:${escape(summary)}`,
      `DESCRIPTION:${escape(e.subject)}`,
      'TRANSP:TRANSPARENT',
      ...alarm(0, summary),
      ...(plan.settings.earlyWarning > 0 && e.type !== 'dinner' ? alarm(plan.settings.earlyWarning, `Soon: ${summary}`) : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
