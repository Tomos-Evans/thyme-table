import { describe, expect, it } from 'vitest';
import { computeSchedule } from './schedule';
import { emptyPlan } from './store';
import { parseLocal } from './time';
import type { Plan } from './types';

const at = (hhmm: string) => parseLocal(`2026-11-26T${hhmm}`);

function plan(): Plan {
  const p = emptyPlan();
  p.dinnerTime = '2026-11-26T17:00';
  p.dishes = [
    {
      id: 'turkey', name: 'Turkey', color: '#000', finishBefore: 0,
      steps: [
        { id: 't1', name: 'Roast', minutes: 120, kind: 'oven', temp: 180 },
        { id: 't2', name: 'Rest', minutes: 20, kind: 'rest' },
      ],
    },
    {
      id: 'roasties', name: 'Roasties', color: '#000', finishBefore: 0,
      steps: [
        { id: 'r1', name: 'Parboil', minutes: 20, kind: 'hob' },
        { id: 'r2', name: 'Drain & fluff', minutes: 10, kind: 'prep' },
        { id: 'r3', name: 'Roast', minutes: 40, kind: 'oven', temp: 200 },
      ],
    },
  ];
  return p;
}

describe('computeSchedule', () => {
  it('works backwards from dinner', () => {
    const s = computeSchedule(plan());
    const slot = (id: string) => s.slots.find((x) => x.step.id === id)!;
    expect(slot('t1').start).toBe(at('14:40'));
    expect(slot('t2').start).toBe(at('16:40'));
    expect(slot('r1').start).toBe(at('15:50'));
    expect(slot('r3').start).toBe(at('16:20'));
    expect(slot('r3').end).toBe(at('17:00'));
  });

  it('respects finishBefore', () => {
    const p = plan();
    p.dishes[1].finishBefore = 10;
    const s = computeSchedule(p);
    expect(s.slots.find((x) => x.step.id === 'r3')!.end).toBe(at('16:50'));
  });

  it('adds preheat and oven temperature changes', () => {
    const s = computeSchedule(plan());
    const preheat = s.events.filter((e) => e.type === 'preheat');
    expect(preheat).toHaveLength(1);
    expect(preheat[0].time).toBe(at('14:25'));
    expect(preheat[0].title).toContain('180°C');
    const up = s.events.find((e) => e.type === 'oven-temp')!;
    expect(up.title).toContain('up to 200°C');
    expect(up.time).toBe(at('16:10'));
  });

  it('describes transitions out of the oven', () => {
    const s = computeSchedule(plan());
    expect(s.events.find((e) => e.id === 'start:t2')!.title).toBe('Out of the oven to rest');
    expect(s.events.find((e) => e.id === 'ready:roasties')!.title).toBe('Out of the oven, ready');
  });

  it('flags temperature clashes', () => {
    const s = computeSchedule(plan());
    const clash = s.warnings.filter((w) => w.type === 'temp');
    expect(clash).toHaveLength(1);
    expect(clash[0].start).toBe(at('16:20'));
    expect(clash[0].end).toBe(at('16:40'));
  });

  it('ignores clashes within tolerance', () => {
    const p = plan();
    p.dishes[1].steps[2].temp = 190;
    expect(computeSchedule(p).warnings.filter((w) => w.type === 'temp')).toHaveLength(0);
  });

  it('flags over-full oven', () => {
    const p = plan();
    p.settings.ovenShelves = 1;
    const full = computeSchedule(p).warnings.filter((w) => w.type === 'oven-full');
    expect(full).toHaveLength(1);
    expect(full[0].start).toBe(at('16:20'));
    expect(full[0].end).toBe(at('16:40'));
  });

  it('sorts events and ends with dinner', () => {
    const s = computeSchedule(plan());
    const times = s.events.map((e) => e.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(s.events.at(-1)!.type).toBe('dinner');
    expect(s.start).toBe(at('14:25'));
  });
});

describe('live adjustments', () => {
  it('re-plans a dish forwards from a late start', () => {
    const p = plan();
    p.actual = { r1: at('16:00') }; // parboil started 10 min late
    const s = computeSchedule(p);
    expect(s.slots.find((x) => x.step.id === 'r3')!.start).toBe(at('16:30'));
    expect(s.events.find((e) => e.id === 'ready:roasties')!.time).toBe(at('17:10'));
    const late = s.warnings.find((w) => w.type === 'late')!;
    expect(late.dishId).toBe('roasties');
    expect(late.minutes).toBe(10);
    // Turkey untouched
    expect(s.slots.find((x) => x.step.id === 't1')!.start).toBe(at('14:40'));
  });

  it('extends a running step', () => {
    const p = plan();
    p.actual = { t1: at('14:40') };
    p.extra = { t1: 15 };
    const s = computeSchedule(p);
    expect(s.slots.find((x) => x.step.id === 't2')!.start).toBe(at('16:55'));
    expect(s.warnings.find((w) => w.type === 'late')!.minutes).toBe(15);
  });

  it('is not late after dinner moves to match', () => {
    const p = plan();
    p.actual = { r1: at('16:00') };
    p.dinnerTime = '2026-11-26T17:10';
    expect(computeSchedule(p).warnings.filter((w) => w.type === 'late')).toHaveLength(0);
  });
});

describe('hands-on clashes', () => {
  it('flags overlapping hands-on steps beyond the number of cooks', () => {
    const p = plan();
    p.dishes.push({ id: 'gravy', name: 'Gravy', color: '#000', finishBefore: 50, steps: [{ id: 'g1', name: 'Whisk', minutes: 15, kind: 'hob', hands: true }] });
    // Gravy whisk 15:55–16:10 overlaps roasties fluff 16:10–16:20? No: touching is fine.
    expect(computeSchedule(p).warnings.filter((w) => w.type === 'hands-full')).toHaveLength(0);
    p.dishes[2].finishBefore = 45; // whisk 16:00–16:15 overlaps fluff 16:10–16:20
    const w = computeSchedule(p).warnings.filter((x) => x.type === 'hands-full');
    expect(w).toHaveLength(1);
    expect(w[0].start).toBe(at('16:10'));
    expect(w[0].end).toBe(at('16:15'));
    p.settings.cooks = 2;
    expect(computeSchedule(p).warnings.filter((x) => x.type === 'hands-full')).toHaveLength(0);
  });
});

describe('pinStarted', () => {
  it('keeps steps already under way when dinner moves', async () => {
    const { pinStarted } = await import('./schedule');
    const p = plan();
    pinStarted(p, computeSchedule(p), at('15:00')); // turkey roasting, roasties not started
    p.dinnerTime = '2026-11-26T17:30';
    const s = computeSchedule(p);
    expect(s.slots.find((x) => x.step.id === 't1')!.start).toBe(at('14:40'));
    expect(s.slots.find((x) => x.step.id === 'r1')!.start).toBe(at('16:20'));
    expect(s.warnings.filter((w) => w.type === 'late')).toHaveLength(0);
  });
});
