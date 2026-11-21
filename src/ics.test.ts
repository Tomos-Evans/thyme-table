import { describe, expect, it } from 'vitest';
import { buildIcs } from './ics';
import { computeSchedule } from './schedule';
import { emptyPlan } from './store';
import { parseLocal } from './time';

describe('buildIcs', () => {
  it('writes one event with an alarm per upcoming action', () => {
    const p = emptyPlan();
    p.dinnerTime = '2026-11-26T17:00';
    p.settings.earlyWarning = 5;
    p.dishes = [{ id: 'd', name: 'Stuffing, sage & onion', color: '#000', finishBefore: 0, steps: [{ id: 's1', name: 'Bake', minutes: 40, kind: 'oven', temp: 190 }] }];
    const s = computeSchedule(p);
    const ics = buildIcs(p, s, parseLocal('2026-11-26T12:00'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4); // preheat, start, ready, dinner
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(7); // early alarm on all but dinner
    expect(ics).toContain('Stuffing\\, sage & onion');
    expect(ics).toContain('SUMMARY:▶️ Into the oven at 190°C: Stuffing');
    expect(ics).toContain('TRIGGER:-PT0M');
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it('skips past and ticked-off events', () => {
    const p = emptyPlan();
    p.dinnerTime = '2026-11-26T17:00';
    p.dishes = [{ id: 'd', name: 'Gravy', color: '#000', finishBefore: 0, steps: [{ id: 'g', name: '', minutes: 20, kind: 'hob' }] }];
    p.done = { 'start:g': true };
    const ics = buildIcs(p, computeSchedule(p), parseLocal('2026-11-26T12:00'));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});

import { spoken } from './alerts';
describe('spoken', () => {
  it('reads temperatures and separators naturally', () => {
    expect(spoken('🔥 Into the oven at 200°C. Roast potatoes · Roast')).toBe('Into the oven at 200 degrees. Roast potatoes, Roast');
  });
});
