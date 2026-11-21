export type StepKind = 'prep' | 'oven' | 'hob' | 'rest' | 'other';

export interface Step {
  id: string;
  name: string;
  minutes: number;
  kind: StepKind;
  /** Oven temperature in the plan's unit. Only meaningful for oven steps. */
  temp?: number;
  /** Needs the cook's attention. Defaults to true for prep, false otherwise. */
  hands?: boolean;
}

export interface Dish {
  id: string;
  name: string;
  color: string;
  /** Minutes before dinner this dish should be finished (0 = exactly at dinner). */
  finishBefore: number;
  steps: Step[];
}

export interface Settings {
  unit: 'C' | 'F';
  ovenShelves: number;
  hobRings: number;
  /** People cooking: how many hands-on steps can happen at once. */
  cooks: number;
  preheatMinutes: number;
  /** Temperature difference (in plan unit) that still counts as compatible. */
  tempTolerance: number;
  alertsEnabled: boolean;
  sound: boolean;
  vibrate: boolean;
  /** Read alerts aloud. */
  speak: boolean;
  /** Extra heads-up alert this many minutes before each action (0 = off). */
  earlyWarning: number;
  keepAwake: boolean;
}

export interface Plan {
  version: 1;
  /** Local date-time, 'YYYY-MM-DDTHH:mm'. */
  dinnerTime: string;
  dishes: Dish[];
  settings: Settings;
  /** Event ids the cook has ticked off. */
  done: Record<string, boolean>;
  /** Step id → when it actually started (ms). The rest of that dish is re-planned forwards from here. */
  actual: Record<string, number>;
  /** Step id → extra minutes added while cooking. */
  extra: Record<string, number>;
}

export const needsHands = (step: Step): boolean => step.hands ?? step.kind === 'prep';

export const KIND_LABEL: Record<StepKind, string> = {
  prep: 'Prep',
  oven: 'Oven',
  hob: 'Hob',
  rest: 'Rest',
  other: 'Other',
};

export const KIND_ICON: Record<StepKind, string> = {
  prep: '🔪',
  oven: '🔥',
  hob: '🍳',
  rest: '💤',
  other: '📌',
};
