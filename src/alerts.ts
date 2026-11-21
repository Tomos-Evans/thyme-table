import { useEffect, useRef, useState } from 'preact/hooks';
import type { PlanEvent, Schedule } from './schedule';
import type { Plan } from './types';
import { MIN } from './time';

const FIRED_KEY = 'thyme-table:fired';
/** Still alert for events up to this late (covers throttled background timers). */
const GRACE = 5 * MIN;

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);
  return now;
}

// ---- Sound ---------------------------------------------------------------

let audio: AudioContext | null = null;
let unlocked = false;
const unlockListeners = new Set<() => void>();

/** Browsers only allow sound and speech after a user gesture; call this from one. */
export function unlockAudio(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    /* no audio support */
  }
  if (!unlocked) {
    unlocked = true;
    // Prime speech while we still have the gesture.
    if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    unlockListeners.forEach((l) => l());
  }
}

/** Whether the user has tapped the page yet (needed before sound/speech can play). */
export function useAudioUnlocked(): boolean {
  const [state, setState] = useState(unlocked);
  useEffect(() => {
    const l = () => setState(true);
    unlockListeners.add(l);
    return () => void unlockListeners.delete(l);
  }, []);
  return state;
}

/** Make an instruction sound natural when read aloud. */
export function spoken(text: string): string {
  return text
    .replace(/(\d+)\s*°C/g, '$1 degrees')
    .replace(/(\d+)\s*°F/g, '$1 degrees Fahrenheit')
    .replace(/ · /g, ', ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '')
    .trim();
}

export function speak(text: string, delayMs = 0): void {
  if (!('speechSynthesis' in window)) return;
  setTimeout(() => {
    const u = new SpeechSynthesisUtterance(spoken(text));
    u.lang = document.documentElement.lang || 'en';
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }, delayMs);
}

export function chime(): void {
  if (!audio) return;
  const t0 = audio.currentTime + 0.05;
  [880, 660, 880, 1046].forEach((freq, i) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = t0 + i * 0.22;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain).connect(audio!.destination);
    osc.start(t);
    osc.stop(t + 0.22);
  });
}

// ---- Notifications ---------------------------------------------------------

export const notificationsSupported = () => typeof Notification !== 'undefined';

export async function requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

export async function notify(title: string, body: string, tag: string): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
    body,
    tag,
    renotify: true,
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    vibrate: [300, 100, 300],
  };
  try {
    // Android Chrome only supports notifications via the service worker.
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch {
    /* ignore */
  }
}

// ---- Alert engine --------------------------------------------------------

function loadFired(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

export interface Alert {
  event: PlanEvent;
  early: boolean;
}

/** Fires onAlert once for each event as its time arrives (and optionally a heads-up beforehand). */
export function useAlerts(schedule: Schedule, plan: Plan, now: number, onAlert: (a: Alert) => void): void {
  const fired = useRef<Set<string>>(loadFired());
  const cb = useRef(onAlert);
  cb.current = onAlert;

  useEffect(() => {
    const early = plan.settings.earlyWarning * MIN;
    let changed = false;
    for (const event of schedule.events) {
      if (plan.done[event.id]) continue;
      const checks: { key: string; at: number; early: boolean }[] = [{ key: `${event.id}@${event.time}`, at: event.time, early: false }];
      if (early > 0 && event.type !== 'dinner') {
        checks.push({ key: `${event.id}@${event.time}:early`, at: event.time - early, early: true });
      }
      for (const c of checks) {
        if (now < c.at || fired.current.has(c.key)) continue;
        fired.current.add(c.key);
        changed = true;
        const stale = now - c.at > GRACE || (c.early && now >= event.time);
        if (!stale) cb.current({ event, early: c.early });
      }
    }
    if (changed) {
      try {
        localStorage.setItem(FIRED_KEY, JSON.stringify([...fired.current].slice(-1000)));
      } catch {
        /* ignore */
      }
    }
  }, [now, schedule, plan.done, plan.settings.earlyWarning]);
}

// ---- Wake lock ------------------------------------------------------------

export function useWakeLock(enabled: boolean): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) {
      setActive(false);
      return;
    }
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || cancelled) return;
      try {
        lock = await navigator.wakeLock.request('screen');
        setActive(true);
        lock.addEventListener('release', () => setActive(false));
      } catch {
        setActive(false);
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
    };
  }, [enabled]);
  return active;
}

// ---- Install prompt -------------------------------------------------------

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredInstall: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();

export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e as BeforeInstallPromptEvent;
    installListeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    installListeners.forEach((l) => l());
  });
}

export function useInstallPrompt(): (() => Promise<void>) | null {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    installListeners.add(l);
    return () => void installListeners.delete(l);
  }, []);
  if (!deferredInstall) return null;
  return async () => {
    const ev = deferredInstall;
    if (!ev) return;
    await ev.prompt();
    await ev.userChoice;
    deferredInstall = null;
    installListeners.forEach((l) => l());
  };
}
