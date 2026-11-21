import { needsHands, type Dish, type Plan, type Step, type StepKind } from './types';
import { MIN, parseLocal } from './time';

export interface Slot {
  dish: Dish;
  step: Step;
  index: number;
  start: number;
  end: number;
}

export type EventType = 'preheat' | 'oven-temp' | 'start' | 'ready' | 'dinner';

export interface PlanEvent {
  id: string;
  time: number;
  type: EventType;
  /** The instruction, e.g. "Into the oven at 200°C". */
  title: string;
  /** What it's about, e.g. "Turkey · Roast". */
  subject: string;
  kind?: StepKind;
  dishId?: string;
  color?: string;
  /** For step starts: when that step ends. */
  until?: number;
}

export interface Warning {
  id: string;
  type: 'temp' | 'oven-full' | 'hob-full' | 'hands-full' | 'late';
  /** For 'late': which dish, and by how many minutes. */
  dishId?: string;
  minutes?: number;
  start: number;
  end: number;
  message: string;
}

export interface Schedule {
  dinner: number;
  slots: Slot[];
  events: PlanEvent[];
  warnings: Warning[];
  /** Earliest moment anything happens (including preheat). */
  start: number;
}

const TYPE_ORDER: Record<EventType, number> = { preheat: 0, 'oven-temp': 1, ready: 2, start: 3, dinner: 4 };

export function fmtTemp(temp: number | undefined, unit: 'C' | 'F'): string {
  return temp == null ? '' : `${temp}°${unit}`;
}

function subjectOf(dish: Dish, step: Step): string {
  const d = dish.name.trim() || 'Untitled dish';
  const s = step.name.trim();
  return s ? `${d} · ${s}` : d;
}

function startTitle(step: Step, prev: Step | undefined, unit: 'C' | 'F'): string {
  const t = fmtTemp(step.temp, unit);
  const from = prev?.kind === 'oven' ? 'Out of the oven' : prev?.kind === 'hob' ? 'Off the heat' : '';
  switch (step.kind) {
    case 'oven':
      if (prev?.kind === 'oven') {
        return step.temp != null && step.temp !== prev.temp ? `Oven to ${t}, carry on` : 'Next stage, still in the oven';
      }
      return t ? `Into the oven at ${t}` : 'Into the oven';
    case 'hob':
      if (prev?.kind === 'hob') return 'Next stage on the hob';
      return from ? `${from}, onto the hob` : 'Onto the hob';
    case 'rest':
      return from ? `${from} to rest` : 'Leave to rest';
    case 'prep':
      return from ? `${from}, then prep` : 'Start prepping';
    default:
      return from || 'Start';
  }
}

function readyTitle(last: Step | undefined): string {
  if (last?.kind === 'oven') return 'Out of the oven, ready';
  if (last?.kind === 'hob') return 'Off the heat, ready';
  return 'Ready';
}

/** Find windows where more than `capacity` slots run at once. */
function capacityWindows(slots: Slot[], capacity: number): { start: number; end: number; names: string[]; peak: number }[] {
  const points = slots
    .filter((s) => s.end > s.start)
    .flatMap((s) => [
      { t: s.start, d: 1, s },
      { t: s.end, d: -1, s },
    ])
    .sort((a, b) => a.t - b.t || a.d - b.d);
  const active = new Set<Slot>();
  const out: { start: number; end: number; names: string[]; peak: number }[] = [];
  let open: { start: number; end: number; names: Set<string>; peak: number } | null = null;
  for (const p of points) {
    if (p.d > 0) active.add(p.s);
    else active.delete(p.s);
    if (active.size > capacity) {
      if (!open) open = { start: p.t, end: p.t, names: new Set(), peak: 0 };
      for (const a of active) open.names.add(a.dish.name.trim() || 'Untitled dish');
      open.peak = Math.max(open.peak, active.size);
    } else if (open) {
      open.end = p.t;
      out.push({ ...open, names: [...open.names] });
      open = null;
    }
  }
  return out;
}

export function computeSchedule(plan: Plan, timeLabel: (t: number) => string = (t) => new Date(t).toISOString()): Schedule {
  const { settings: s } = plan;
  const dinner = parseLocal(plan.dinnerTime);
  const slots: Slot[] = [];
  const events: PlanEvent[] = [];

  const late: Warning[] = [];
  for (const dish of plan.dishes) {
    const due = dinner - Math.max(0, dish.finishBefore || 0) * MIN;
    const dur = (step: Step) => Math.max(0, (step.minutes || 0) + (plan.extra?.[step.id] ?? 0)) * MIN;
    const starts: number[] = new Array(dish.steps.length);
    // The latest step with a recorded real start anchors the dish: later steps run forwards from it.
    let anchor = -1;
    dish.steps.forEach((st, i) => {
      if (plan.actual?.[st.id] != null) anchor = i;
    });
    if (anchor < 0) {
      let t = due;
      for (let i = dish.steps.length - 1; i >= 0; i--) starts[i] = t -= dur(dish.steps[i]);
    } else {
      starts[anchor] = plan.actual[dish.steps[anchor].id];
      for (let i = anchor + 1; i < dish.steps.length; i++) starts[i] = starts[i - 1] + dur(dish.steps[i - 1]);
      for (let i = anchor - 1; i >= 0; i--) starts[i] = starts[i + 1] - dur(dish.steps[i]);
    }
    const dishSlots: Slot[] = dish.steps.map((step, i) => ({ dish, step, index: i, start: starts[i], end: starts[i] + dur(step) }));
    const ready = dishSlots.length ? dishSlots[dishSlots.length - 1].end : due;
    if (ready - due >= MIN) {
      const minutes = Math.ceil((ready - due) / MIN);
      late.push({
        id: `late:${dish.id}`,
        type: 'late',
        dishId: dish.id,
        minutes,
        start: due,
        end: ready,
        message: `${dish.name.trim() || 'Untitled dish'} is running ${minutes} min behind. It will be ready at ${timeLabel(ready)}${dish.finishBefore ? '' : ', after dinner time'}.`,
      });
    }
    slots.push(...dishSlots);
    dishSlots.forEach((slot, i) => {
      events.push({
        id: `start:${slot.step.id}`,
        time: slot.start,
        type: 'start',
        title: startTitle(slot.step, dish.steps[i - 1], s.unit),
        subject: subjectOf(dish, slot.step),
        kind: slot.step.kind,
        dishId: dish.id,
        color: dish.color,
        until: slot.end,
      });
    });
    if (dish.steps.length) {
      events.push({
        id: `ready:${dish.id}`,
        time: ready,
        type: 'ready',
        title: readyTitle(dish.steps[dish.steps.length - 1]),
        subject: dish.name.trim() || 'Untitled dish',
        dishId: dish.id,
        color: dish.color,
      });
    }
  }

  // Oven: preheat before each continuous run of oven use, and prompt temperature changes.
  const oven = slots.filter((x) => x.step.kind === 'oven' && x.end > x.start).sort((a, b) => a.start - b.start || a.end - b.end);
  let group: Slot[] = [];
  let groupEnd = -Infinity;
  const flush = () => {
    if (!group.length) return;
    const first = group[0];
    const firstTemp = group.find((g) => g.step.temp != null)?.step.temp;
    events.push({
      id: `preheat:${first.step.id}`,
      time: first.start - s.preheatMinutes * MIN,
      type: 'preheat',
      title: firstTemp != null ? `Preheat the oven to ${fmtTemp(firstTemp, s.unit)}` : 'Preheat the oven',
      subject: `For ${subjectOf(first.dish, first.step)}`,
      kind: 'oven',
    });
    let current = firstTemp;
    for (const g of group.slice(1)) {
      const temp = g.step.temp;
      if (temp == null) continue;
      if (current != null && Math.abs(temp - current) > s.tempTolerance) {
        const up = temp > current;
        events.push({
          id: `oven-temp:${g.step.id}`,
          time: up ? g.start - Math.min(s.preheatMinutes, 10) * MIN : g.start,
          type: 'oven-temp',
          title: `Turn the oven ${up ? 'up' : 'down'} to ${fmtTemp(temp, s.unit)}`,
          subject: `For ${subjectOf(g.dish, g.step)}`,
          kind: 'oven',
        });
      }
      current = temp;
    }
    group = [];
  };
  for (const slot of oven) {
    if (slot.start > groupEnd) flush();
    group.push(slot);
    groupEnd = Math.max(groupEnd, slot.end);
  }
  flush();

  events.push({ id: 'dinner', time: dinner, type: 'dinner', title: 'Dinner is served', subject: 'Time to eat!' });
  events.sort((a, b) => a.time - b.time || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);

  // Warnings
  const warnings: Warning[] = [];
  for (let i = 0; i < oven.length; i++) {
    for (let j = i + 1; j < oven.length; j++) {
      const a = oven[i];
      const b = oven[j];
      if (a.dish.id === b.dish.id) continue;
      if (!(a.start < b.end && b.start < a.end)) continue;
      if (a.step.temp == null || b.step.temp == null) continue;
      if (Math.abs(a.step.temp - b.step.temp) <= s.tempTolerance) continue;
      const start = Math.max(a.start, b.start);
      const end = Math.min(a.end, b.end);
      warnings.push({
        id: `temp:${a.step.id}:${b.step.id}`,
        type: 'temp',
        start,
        end,
        message: `${subjectOf(a.dish, a.step)} (${fmtTemp(a.step.temp, s.unit)}) and ${subjectOf(b.dish, b.step)} (${fmtTemp(b.step.temp, s.unit)}) are in the oven together, ${timeLabel(start)}–${timeLabel(end)}.`,
      });
    }
  }
  for (const w of capacityWindows(oven, s.ovenShelves)) {
    warnings.push({
      id: `oven-full:${w.start}`,
      type: 'oven-full',
      start: w.start,
      end: w.end,
      message: `${w.peak} things in the oven at once (you have ${s.ovenShelves} shelves), ${timeLabel(w.start)}–${timeLabel(w.end)}: ${w.names.join(', ')}.`,
    });
  }
  const hob = slots.filter((x) => x.step.kind === 'hob');
  for (const w of capacityWindows(hob, s.hobRings)) {
    warnings.push({
      id: `hob-full:${w.start}`,
      type: 'hob-full',
      start: w.start,
      end: w.end,
      message: `${w.peak} things on the hob at once (you have ${s.hobRings} rings), ${timeLabel(w.start)}–${timeLabel(w.end)}: ${w.names.join(', ')}.`,
    });
  }
  const hands = slots.filter((x) => needsHands(x.step));
  for (const w of capacityWindows(hands, s.cooks)) {
    const who = s.cooks === 1 ? "You're" : `All ${s.cooks} cooks are`;
    warnings.push({
      id: `hands-full:${w.start}`,
      type: 'hands-full',
      start: w.start,
      end: w.end,
      message: `${who} needed for ${w.peak} hands-on steps at once, ${timeLabel(w.start)}–${timeLabel(w.end)}: ${w.names.join(', ')}.`,
    });
  }
  warnings.sort((a, b) => a.start - b.start);
  warnings.unshift(...late);

  const start = Math.min(dinner, ...events.map((e) => e.time));
  return { dinner, slots, events, warnings, start };
}

/**
 * Before moving dinner mid-cook: pin each dish's step that's already under way to when it really started,
 * so only what hasn't started yet moves.
 */
export function pinStarted(draft: Plan, schedule: Schedule, now: number): void {
  for (const dish of draft.dishes) {
    const started = schedule.slots.filter((x) => x.dish.id === dish.id && x.start <= now);
    const latest = started[started.length - 1];
    if (latest && draft.actual[latest.step.id] == null) draft.actual[latest.step.id] = latest.start;
  }
}
