import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { chime, notify, speak, unlockAudio, useAlerts, useNow, useWakeLock, type Alert } from './alerts';
import { computeSchedule, type PlanEvent } from './schedule';
import { loadPlan, savePlan } from './store';
import { MIN, fmtWhen, parseLocal } from './time';
import type { Plan } from './types';
import { eventIcon } from './ui';
import { NowView } from './views/Now';
import { PlanView } from './views/Plan';
import { DishesView } from './views/Dishes';
import { SettingsView } from './views/Settings';

export type Mutate = (fn: (draft: Plan) => void) => void;
export type Go = (route: string) => void;

const TABS = [
  { id: 'now', label: 'Now', icon: '⏱️' },
  { id: 'plan', label: 'Plan', icon: '🗓️' },
  { id: 'dishes', label: 'Dishes', icon: '🦃' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
] as const;

interface Toast extends Alert {
  key: string;
}

const readRoute = () => location.hash.replace(/^#\/?/, '') || 'now';

export function App() {
  const [plan, setPlan] = useState<Plan>(loadPlan);
  const [route, setRoute] = useState(readRoute);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [latePrompt, setLatePrompt] = useState<{ event: PlanEvent; stepId: string; dishName: string; at: number; lateMin: number } | null>(null);
  const now = useNow();

  const dinner = parseLocal(plan.dinnerTime);
  const schedule = useMemo(() => computeSchedule(plan, (t) => fmtWhen(t, dinner)), [plan, dinner]);

  useEffect(() => savePlan(plan), [plan]);

  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'thyme-table:plan') setPlan(loadPlan());
    };
    const onGesture = () => unlockAudio();
    window.addEventListener('hashchange', onHash);
    window.addEventListener('storage', onStorage);
    window.addEventListener('pointerdown', onGesture);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pointerdown', onGesture);
    };
  }, []);

  const mutate: Mutate = useCallback((fn) => {
    setPlan((p) => {
      const draft = structuredClone(p);
      fn(draft);
      return draft;
    });
  }, []);

  const go: Go = useCallback((r) => {
    location.hash = r;
  }, []);

  /** Tick or untick an event. Ticking a step off late offers to re-plan the rest of that dish. */
  const toggleDone = (e: PlanEvent) => {
    if (plan.done[e.id]) {
      mutate((d) => void delete d.done[e.id]);
      return;
    }
    mutate((d) => void (d.done[e.id] = true));
    const at = Date.now();
    const lateMin = Math.ceil((at - e.time) / MIN);
    const slot = e.type === 'start' ? schedule.slots.find((s) => `start:${s.step.id}` === e.id) : undefined;
    if (slot && at - e.time >= 2 * MIN && plan.actual[slot.step.id] == null) {
      setLatePrompt({ event: e, stepId: slot.step.id, dishName: slot.dish.name.trim() || 'this dish', at, lateMin });
    }
  };

  /** Give a running step more time: pin its start, then add minutes, so the rest of the dish moves later. */
  const extend = (stepId: string, start: number, minutes: number) =>
    mutate((d) => {
      d.actual[stepId] ??= start;
      d.extra[stepId] = (d.extra[stepId] ?? 0) + minutes;
      if (d.extra[stepId] === 0) delete d.extra[stepId];
    });

  const dismiss = (key: string) => setToasts((ts) => ts.filter((t) => t.key !== key));

  useAlerts(schedule, plan, now, (alert) => {
    const { event, early } = alert;
    const s = plan.settings;
    const key = `${event.id}:${early}:${Date.now()}`;
    setToasts((ts) => [...ts.filter((t) => t.event.id !== event.id), { ...alert, key }].slice(-4));
    setTimeout(() => dismiss(key), 3 * 60_000);
    if (s.sound) chime();
    if (s.vibrate && 'vibrate' in navigator) navigator.vibrate([300, 120, 300, 120, 300]);
    if (s.speak) {
      speak(early ? `In ${s.earlyWarning} minutes: ${event.title}. ${event.subject}` : `${event.title}. ${event.subject}`, s.sound ? 1000 : 0);
    }
    if (s.alertsEnabled) {
      const mins = s.earlyWarning;
      void notify(
        early ? `In ${mins} min: ${event.title}` : `${eventIcon(event)} ${event.title}`,
        `${event.subject} · ${fmtWhen(event.time, dinner)}`,
        event.id,
      );
    }
  });

  const wakeLockActive = useWakeLock(plan.settings.keepAwake);

  const [section, sub] = route.split('/');
  const props = { plan, schedule, now, mutate, go, toggleDone, extend };

  return (
    <div class="app">
      <header class="topbar">
        <a class="brand" href="#now">
          <img src="icons/icon.svg" alt="" width="28" height="28" />
          <span>Thyme Table</span>
        </a>
        <a class="dinner-chip" href="#settings" title="Change dinner time">
          🍽️ {Number.isFinite(dinner) ? fmtWhen(dinner, now) : 'Set dinner time'}
        </a>
      </header>

      <div class="toasts" role="status" aria-live="assertive">
        {toasts.map((t) => (
          <div class={`toast ${t.early ? 'is-early' : ''}`} key={t.key}>
            <span class="toast-icon">{eventIcon(t.event)}</span>
            <div class="toast-body">
              <strong>
                {t.early ? `In ${plan.settings.earlyWarning} min: ` : ''}
                {t.event.title}
              </strong>
              <span>{t.event.subject}</span>
            </div>
            <div class="toast-actions">
              {!t.early && t.event.type !== 'dinner' && (
                <button
                  type="button"
                  class="btn btn-small btn-primary"
                  onClick={() => {
                    if (!plan.done[t.event.id]) toggleDone(t.event);
                    dismiss(t.key);
                  }}
                >
                  Done
                </button>
              )}
              <button type="button" class="btn btn-small" onClick={() => dismiss(t.key)}>
                OK
              </button>
            </div>
          </div>
        ))}
      </div>

      <main class="content">
        {section === 'plan' ? (
          <PlanView {...props} />
        ) : section === 'dishes' ? (
          <DishesView {...props} editing={sub ?? null} />
        ) : section === 'settings' ? (
          <SettingsView {...props} wakeLockActive={wakeLockActive} />
        ) : (
          <NowView {...props} />
        )}
      </main>

      {latePrompt && (
        <div class="sheet-backdrop" onClick={() => setLatePrompt(null)}>
          <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="late-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="late-title">Started {latePrompt.lateMin} min late?</h3>
            <p>
              <strong>{latePrompt.event.subject}</strong> was due at {fmtWhen(latePrompt.event.time, now)}. Push the rest of{' '}
              {latePrompt.dishName} back so every step still gets its full time?
            </p>
            <button
              type="button"
              class="btn btn-primary btn-big"
              onClick={() => {
                mutate((d) => void (d.actual[latePrompt.stepId] = latePrompt.at));
                setLatePrompt(null);
              }}
            >
              Yes, push {latePrompt.dishName} back
            </button>
            <button type="button" class="btn btn-big" onClick={() => setLatePrompt(null)}>
              No, I'll catch up
            </button>
          </div>
        </div>
      )}

      <nav class="tabbar">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} class={section === t.id || (t.id === 'now' && !TABS.some((x) => x.id === section)) ? 'is-active' : ''}>
            <span class="tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

export interface ViewProps {
  plan: Plan;
  schedule: ReturnType<typeof computeSchedule>;
  now: number;
  mutate: Mutate;
  go: Go;
  toggleDone: (e: PlanEvent) => void;
  extend: (stepId: string, start: number, minutes: number) => void;
}
