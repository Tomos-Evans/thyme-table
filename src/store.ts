import type { Dish, Plan, Settings, Step } from './types';
import { defaultDinner } from './time';

const KEY = 'thyme-table:plan';

export const DISH_COLORS = ['#d9622b', '#c9a227', '#5a9e6f', '#3d8fb5', '#8a6bbf', '#c25389', '#8c6d4f', '#6b7f8c'];

export const DEFAULT_SETTINGS: Settings = {
  unit: 'C',
  ovenShelves: 3,
  hobRings: 4,
  cooks: 1,
  preheatMinutes: 15,
  tempTolerance: 10,
  alertsEnabled: true,
  sound: true,
  vibrate: true,
  speak: true,
  earlyWarning: 0,
  keepAwake: true,
};

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function emptyPlan(): Plan {
  return { version: 1, dinnerTime: defaultDinner(), dishes: [], settings: { ...DEFAULT_SETTINGS }, done: {}, actual: {}, extra: {} };
}

export function newStep(partial: Partial<Step> = {}): Step {
  return { id: uid(), name: '', minutes: 20, kind: 'prep', ...partial };
}

export function newDish(existing: Dish[]): Dish {
  return {
    id: uid(),
    name: '',
    color: DISH_COLORS[existing.length % DISH_COLORS.length],
    finishBefore: 0,
    steps: [newStep()],
  };
}

function numberMap(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {};
  return Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === 'number' && Number.isFinite(n)));
}

/** Accept anything plausibly shaped like a plan; fill gaps with defaults. */
export function normalisePlan(raw: unknown): Plan {
  const base = emptyPlan();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Plan>;
  const dishes = Array.isArray(r.dishes) ? r.dishes : [];
  return {
    version: 1,
    dinnerTime: typeof r.dinnerTime === 'string' ? r.dinnerTime : base.dinnerTime,
    settings: { ...DEFAULT_SETTINGS, ...(r.settings ?? {}) },
    done: r.done && typeof r.done === 'object' ? r.done : {},
    actual: numberMap(r.actual),
    extra: numberMap(r.extra),
    dishes: dishes.map((d, i) => ({
      id: String(d.id ?? uid()),
      name: String(d.name ?? ''),
      color: String(d.color ?? DISH_COLORS[i % DISH_COLORS.length]),
      finishBefore: Number(d.finishBefore) || 0,
      steps: (Array.isArray(d.steps) ? d.steps : []).map((st) => ({
        id: String(st.id ?? uid()),
        name: String(st.name ?? ''),
        minutes: Math.max(0, Number(st.minutes) || 0),
        kind: (['prep', 'oven', 'hob', 'rest', 'other'] as const).includes(st.kind) ? st.kind : 'other',
        temp: st.temp == null || st.temp === ('' as never) ? undefined : Number(st.temp),
        hands: st.hands == null ? undefined : !!st.hands,
      })),
    })),
  };
}

export function loadPlan(): Plan {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalisePlan(JSON.parse(raw)) : emptyPlan();
  } catch {
    return emptyPlan();
  }
}

export function savePlan(plan: Plan): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(plan));
  } catch {
    /* storage full or blocked: nothing sensible to do */
  }
}
