import { useState } from 'preact/hooks';
import type { ViewProps } from '../app';
import { chime, notificationsSupported, notify, requestNotifications, speak, unlockAudio, useInstallPrompt } from '../alerts';
import { buildIcs } from '../ics';
import { pinStarted } from '../schedule';
import { emptyPlan, normalisePlan } from '../store';
import { fmtLongDate, fmtTime } from '../time';
import type { Settings } from '../types';
import { NumberField, Toggle } from '../ui';

const toF = (c: number) => Math.round((c * 9) / 5 + 32);
const toC = (f: number) => Math.round(((f - 32) * 5) / 9);

export function SettingsView({ plan, schedule, mutate, wakeLockActive }: ViewProps & { wakeLockActive: boolean }) {
  const s = plan.settings;
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => mutate((d) => void (d.settings[key] = value));
  const [perm, setPerm] = useState<string>(notificationsSupported() ? Notification.permission : 'unsupported');
  const install = useInstallPrompt();
  const standalone = matchMedia('(display-mode: standalone)').matches;

  const switchUnit = (unit: 'C' | 'F') => {
    if (unit === s.unit) return;
    const conv = unit === 'F' ? toF : toC;
    mutate((d) => {
      d.settings.unit = unit;
      d.settings.tempTolerance = Math.round(unit === 'F' ? (d.settings.tempTolerance * 9) / 5 : (d.settings.tempTolerance * 5) / 9);
      for (const dish of d.dishes) for (const st of dish.steps) if (st.temp != null) st.temp = conv(st.temp);
    });
  };

  const exportPlan = () => {
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `thyme-table-${plan.dinnerTime.slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importPlan = async (file: File | undefined) => {
    if (!file) return;
    try {
      const next = normalisePlan(JSON.parse(await file.text()));
      if (!confirm(`Replace your current plan with ${next.dishes.length} dishes from ${file.name}?`)) return;
      mutate((d) => Object.assign(d, next));
    } catch {
      alert("That file doesn't look like a Thyme Table plan.");
    }
  };

  const exportCalendar = async () => {
    const ics = buildIcs(plan, schedule, Date.now());
    const name = `thyme-table-${plan.dinnerTime.slice(0, 10)}.ics`;
    const file = new File([ics], name, { type: 'text/calendar' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Thyme Table plan' });
        return;
      }
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const testAlert = async () => {
    unlockAudio();
    if (s.sound) chime();
    if (s.vibrate && 'vibrate' in navigator) navigator.vibrate([300, 120, 300]);
    if (s.speak) speak('Into the oven at 180°C. This is a test alert', s.sound ? 1000 : 0);
    if (s.alertsEnabled) await notify('🔥 Into the oven at 180°C', 'Test · this is what an alert looks like', 'test');
  };

  return (
    <div class="settings">
      <h1 class="page-title">Settings</h1>

      <section class="panel">
        <h2>Dinner</h2>
        <label class="field">
          <span>Dinner is served at</span>
          <input
            type="datetime-local"
            value={plan.dinnerTime}
            onChange={(e) => {
              const v = (e.currentTarget as HTMLInputElement).value;
              if (!v) return;
              mutate((d) => {
                pinStarted(d, schedule, Date.now());
                d.dinnerTime = v;
              });
            }}
          />
          {Number.isFinite(schedule.dinner) && (
            <small class="muted">
              {fmtLongDate(schedule.dinner)} at {fmtTime(schedule.dinner)}
            </small>
          )}
        </label>
      </section>

      <section class="panel">
        <h2>Kitchen</h2>
        <div class="field">
          <span>Temperature unit</span>
          <div class="segmented">
            {(['C', 'F'] as const).map((u) => (
              <button type="button" key={u} class={s.unit === u ? 'is-selected' : ''} onClick={() => switchUnit(u)}>
                °{u}
              </button>
            ))}
          </div>
        </div>
        <div class="grid-2">
          <label class="field">
            <span>Oven shelves</span>
            <NumberField value={s.ovenShelves} min={1} max={10} onChange={(v) => set('ovenShelves', v ?? 1)} />
          </label>
          <label class="field">
            <span>Hob rings</span>
            <NumberField value={s.hobRings} min={1} max={10} onChange={(v) => set('hobRings', v ?? 1)} />
          </label>
          <label class="field">
            <span>People cooking</span>
            <NumberField value={s.cooks} min={1} max={10} onChange={(v) => set('cooks', v ?? 1)} />
          </label>
          <label class="field">
            <span>Preheat time</span>
            <div class="input-suffix">
              <NumberField value={s.preheatMinutes} min={0} max={60} onChange={(v) => set('preheatMinutes', v ?? 0)} />
              <span>min</span>
            </div>
          </label>
          <label class="field">
            <span>Temp. leeway</span>
            <div class="input-suffix">
              <NumberField value={s.tempTolerance} min={0} max={100} onChange={(v) => set('tempTolerance', v ?? 0)} />
              <span>°{s.unit}</span>
            </div>
          </label>
        </div>
        <small class="muted">
          Oven dishes overlapping by more than the leeway count as a clash. So does more dishes than shelves, more pans than
          rings, or more 🙌 hands-on steps than people cooking.
        </small>
      </section>

      <section class="panel">
        <h2>Alerts</h2>
        <div class="field">
          <span>Notifications</span>
          {perm === 'granted' ? (
            <small class="ok">✓ Allowed</small>
          ) : perm === 'denied' ? (
            <small class="bad">Blocked. Allow notifications for this site in Chrome's site settings.</small>
          ) : perm === 'unsupported' ? (
            <small class="muted">Not supported in this browser.</small>
          ) : (
            <button type="button" class="btn btn-primary" onClick={async () => setPerm(await requestNotifications())}>
              Allow notifications
            </button>
          )}
        </div>
        <Toggle label="Show notifications" checked={s.alertsEnabled} onChange={(v) => set('alertsEnabled', v)} />
        <Toggle label="Play a chime" checked={s.sound} onChange={(v) => set('sound', v)} />
        <Toggle label="Vibrate" checked={s.vibrate} onChange={(v) => set('vibrate', v)} />
        <Toggle
          label="Read alerts aloud"
          hint={'speechSynthesis' in window ? 'e.g. "Into the oven at 200 degrees. Roast potatoes"' : 'Not supported here'}
          checked={s.speak}
          onChange={(v) => set('speak', v)}
        />
        <Toggle
          label="Keep screen awake"
          hint={'wakeLock' in navigator ? (wakeLockActive ? 'Screen will stay on while the app is open' : 'Screen can sleep') : 'Not supported here'}
          checked={s.keepAwake}
          onChange={(v) => set('keepAwake', v)}
        />
        <label class="field">
          <span>Heads-up before each step</span>
          <select value={String(s.earlyWarning)} onChange={(e) => set('earlyWarning', Number((e.currentTarget as HTMLSelectElement).value))}>
            <option value="0">Off</option>
            <option value="2">2 minutes before</option>
            <option value="5">5 minutes before</option>
            <option value="10">10 minutes before</option>
          </select>
        </label>
        <button type="button" class="btn" onClick={testAlert}>
          Test alert
        </button>
        <p class="note">
          Alerts come from the app itself, so <strong>keep Thyme Table open</strong> (screen on is best) while you cook.
          Chrome pauses background pages, so with the screen off an alert may arrive up to a minute late or not until you
          reopen the app.
        </p>
      </section>

      <section class="panel">
        <h2>Calendar backup</h2>
        <p class="muted small">
          In-app alerts need Thyme Table open. As a backup, export every upcoming step as a calendar event with an alarm, so
          your phone's calendar reminds you even if the app is closed.
        </p>
        <button type="button" class="btn btn-primary" onClick={exportCalendar} disabled={!plan.dishes.length}>
          📅 Export to calendar (.ics)
        </button>
        <details class="howto">
          <summary>How to add it to Google Calendar</summary>
          <ol>
            <li>
              On a computer, open <strong>calendar.google.com</strong> and create a new calendar called "Thanksgiving".
            </li>
            <li>
              In that calendar's settings, set <strong>Event notifications</strong> to <strong>0 minutes before</strong>.
              Google ignores the alarms inside imported files and uses this instead.
            </li>
            <li>
              <strong>Settings → Import &amp; export</strong>: import the .ics file into the Thanksgiving calendar.
            </li>
          </ol>
          <p>
            The Google Calendar app on Android can't open .ics files itself. Other calendar apps (e.g. Samsung Calendar)
            can: tap the downloaded file or share it to them.
          </p>
          <p>
            <strong>The export is a snapshot.</strong> If the plan changes, delete the Thanksgiving calendar's events and
            export again.
          </p>
        </details>
      </section>

      <section class="panel">
        <h2>App</h2>
        {standalone ? (
          <p class="muted">✓ Installed. You're running Thyme Table as an app.</p>
        ) : install ? (
          <button type="button" class="btn btn-primary" onClick={install}>
            Install on this device
          </button>
        ) : (
          <p class="muted">
            To install: open Chrome's ⋮ menu → <strong>Add to Home screen</strong> (or <strong>Install app</strong>). It works
            offline once installed.
          </p>
        )}
      </section>

      <section class="panel">
        <h2>Your data</h2>
        <p class="muted small">Everything is stored only on this device.</p>
        <div class="button-row">
          <button type="button" class="btn" onClick={exportPlan}>
            Export plan
          </button>
          <label class="btn">
            Import plan
            <input type="file" accept="application/json,.json" hidden onChange={(e) => importPlan((e.currentTarget as HTMLInputElement).files?.[0])} />
          </label>
          <button
            type="button"
            class="btn"
            onClick={() =>
              confirm('Untick every step and undo any running-late changes?') &&
              mutate((d) => {
                d.done = {};
                d.actual = {};
                d.extra = {};
              })
            }
          >
            Reset progress
          </button>
          <button
            type="button"
            class="btn danger"
            onClick={() => confirm('Delete all dishes and settings? This cannot be undone.') && mutate((d) => Object.assign(d, emptyPlan()))}
          >
            Start over
          </button>
        </div>
      </section>
    </div>
  );
}
