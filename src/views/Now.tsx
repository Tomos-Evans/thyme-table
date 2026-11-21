import type { ViewProps } from '../app';
import { useAudioUnlocked } from '../alerts';
import { pinStarted, type PlanEvent } from '../schedule';
import { MIN, fmtCountdown, fmtDuration, fmtRelative, fmtTime, fmtWhen } from '../time';
import { KIND_ICON, KIND_LABEL } from '../types';
import { DoneButton, eventIcon } from '../ui';
import { Warnings } from './Warnings';

export function NowView({ plan, schedule, now, mutate, go, toggleDone, extend }: ViewProps) {
  const { dinner, events, slots } = schedule;
  const soundReady = useAudioUnlocked();
  const shiftDinner = (mins: number) =>
    mutate((d) => {
      pinStarted(d, schedule, Date.now());
      const t = new Date(dinner + mins * MIN);
      const pad = (n: number) => String(n).padStart(2, '0');
      d.dinnerTime = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
    });

  if (!plan.dishes.length) {
    return (
      <div class="empty">
        <div class="empty-art">🦃</div>
        <h1>Let's plan dinner</h1>
        <p>
          Set your dinner time, then add each dish as a list of steps (prep, hob, oven, rest). Thyme Table works backwards and
          tells you exactly when to do what.
        </p>
        <div class="stack">
          <button type="button" class="btn btn-primary btn-big" onClick={() => go('dishes/new')}>
            Add your first dish
          </button>
          <button type="button" class="btn btn-big" onClick={() => go('settings')}>
            Set dinner time
          </button>
        </div>
      </div>
    );
  }

  const overdue = events.filter((e) => e.time <= now && !plan.done[e.id] && e.type !== 'dinner');
  const cooking = slots.filter((s) => s.start <= now && now < s.end).sort((a, b) => a.end - b.end);
  const upcoming = events.filter((e) => e.time > now);
  const next = upcoming[0];
  const later = upcoming.slice(1, 8);
  const late = schedule.warnings.filter((w) => w.type === 'late' && dinner > now - 30 * MIN);
  const lateBy = Math.max(0, ...late.map((w) => w.minutes ?? 0));
  const toDinner = dinner - now;
  const started = now >= schedule.start;

  return (
    <div class="now">
      <section class="hero">
        <div class="clock">{fmtTime(now)}</div>
        <div class="hero-sub">
          {toDinner > 0 ? (
            <>
              Dinner <strong>{fmtRelative(dinner, now)}</strong> · {fmtWhen(dinner, now)}
            </>
          ) : toDinner > -60 * MIN ? (
            <strong>Dinner time! Enjoy 🍽️</strong>
          ) : (
            <>Dinner was {fmtWhen(dinner, now)}. Hope it was delicious.</>
          )}
        </div>
        {!started && (
          <div class="hero-sub muted">
            Cooking starts {fmtRelative(schedule.start, now)} ({fmtWhen(schedule.start, now)})
          </div>
        )}
      </section>

      {!soundReady && (plan.settings.sound || plan.settings.speak) && (
        <button type="button" class="sound-banner">
          🔊 Tap here to turn on sound and voice alerts
        </button>
      )}

      {late.length > 0 && (
        <section class="late-banner" role="alert">
          {late.map((w) => (
            <p key={w.id}>⏰ {w.message}</p>
          ))}
          <div class="button-row">
            <button type="button" class="btn btn-primary" onClick={() => shiftDinner(lateBy)}>
              Move dinner to {fmtTime(dinner + lateBy * MIN)}
            </button>
          </div>
          <small>Or let {late.length === 1 ? 'it' : 'them'} finish after dinner time.</small>
        </section>
      )}

      <Warnings schedule={schedule} now={now} compact />

      {overdue.length > 0 && (
        <section class="block">
          <div class="block-head">
            <h2>Do now</h2>
            {overdue.length > 1 && (
              <button type="button" class="btn btn-small" onClick={() => mutate((d) => overdue.forEach((e) => (d.done[e.id] = true)))}>
                All done
              </button>
            )}
          </div>
          <ul class="cards">
            {overdue.map((e) => (
              <EventCard key={e.id} e={e} now={now} done={false} onToggle={() => toggleDone(e)} urgent />
            ))}
          </ul>
        </section>
      )}

      {next && (
        <section class="block">
          <h2>Next up</h2>
          <div class="next-card" style={{ '--dish': next.color ?? 'var(--accent)' }}>
            <div class="next-count">
              {next.time - now < 60 * MIN ? fmtCountdown(next.time - now) : fmtRelative(next.time, now)}
              <span>at {fmtWhen(next.time, now)}</span>
            </div>
            <div class="next-main">
              <span class="next-icon">{eventIcon(next)}</span>
              <div>
                <div class="next-title">{next.title}</div>
                <div class="next-subject">{next.subject}</div>
                {next.until && next.until > next.time && (
                  <div class="muted small">
                    for {fmtDuration((next.until - next.time) / MIN)}, until {fmtWhen(next.until, now)}
                  </div>
                )}
              </div>
              {next.type !== 'dinner' && <DoneButton done={!!plan.done[next.id]} onToggle={() => toggleDone(next)} />}
            </div>
          </div>
        </section>
      )}

      {cooking.length > 0 && (
        <section class="block">
          <h2>On the go</h2>
          <ul class="cards">
            {cooking.map((s) => {
              const pct = ((now - s.start) / (s.end - s.start)) * 100;
              const extra = plan.extra[s.step.id] ?? 0;
              return (
                <li class="card progress-card" key={s.step.id} style={{ '--dish': s.dish.color }}>
                  <div class="row">
                    <span class={`kind-pill kind-${s.step.kind}`}>
                      {KIND_ICON[s.step.kind]} {KIND_LABEL[s.step.kind]}
                      {s.step.kind === 'oven' && s.step.temp != null ? ` ${s.step.temp}°${plan.settings.unit}` : ''}
                    </span>
                    <span class="grow" />
                    <strong>{fmtDuration(Math.ceil((s.end - now) / MIN))} left</strong>
                  </div>
                  <div class="card-title">
                    {s.dish.name || 'Untitled dish'}
                    {s.step.name && <span class="muted"> · {s.step.name}</span>}
                  </div>
                  <div class="bar">
                    <div class="bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div class="muted small">
                    until {fmtWhen(s.end, now)}
                    {extra > 0 && <> · {extra} min added</>}
                  </div>
                  <div class="row extend-row">
                    <span class="small grow">Needs longer?</span>
                    {extra > 0 && (
                      <button type="button" class="btn btn-small" aria-label="Remove 5 minutes" onClick={() => extend(s.step.id, s.start, -Math.min(5, extra))}>
                        −5
                      </button>
                    )}
                    <button type="button" class="btn btn-small" onClick={() => extend(s.step.id, s.start, 5)}>
                      +5 min
                    </button>
                    <button type="button" class="btn btn-small" onClick={() => extend(s.step.id, s.start, 10)}>
                      +10 min
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {later.length > 0 && (
        <section class="block">
          <h2>Coming up</h2>
          <ul class="list">
            {later.map((e) => (
              <li key={e.id} class="list-row" style={{ '--dish': e.color ?? 'transparent' }}>
                <span class="list-time">{fmtWhen(e.time, now)}</span>
                <span class="list-icon">{eventIcon(e)}</span>
                <span class="list-text">
                  <strong>{e.title}</strong>
                  <span>{e.subject}</span>
                </span>
                <span class="list-rel">{fmtRelative(e.time, now)}</span>
              </li>
            ))}
          </ul>
          <button type="button" class="btn btn-link" onClick={() => go('plan')}>
            See the whole plan →
          </button>
        </section>
      )}

      <section class="block">
        <h2>Move dinner</h2>
        <p class="muted small">
          Steps already under way keep going; everything else moves. If one dish needs longer, use +5 on it under{' '}
          <em>On the go</em>.
        </p>
        <div class="shift">
          <button type="button" class="btn" onClick={() => shiftDinner(-5)}>
            −5 min
          </button>
          <button type="button" class="btn" onClick={() => shiftDinner(5)}>
            +5 min
          </button>
          <button type="button" class="btn" onClick={() => shiftDinner(15)}>
            +15 min
          </button>
          <button type="button" class="btn" onClick={() => shiftDinner(30)}>
            +30 min
          </button>
        </div>
      </section>
    </div>
  );
}

export function EventCard({ e, now, done, onToggle, urgent }: { e: PlanEvent; now: number; done: boolean; onToggle: () => void; urgent?: boolean }) {
  return (
    <li class={`card event-card ${urgent ? 'is-urgent' : ''}`} style={{ '--dish': e.color ?? 'var(--accent)' }}>
      <span class="event-icon">{eventIcon(e)}</span>
      <div class="grow">
        <div class="card-title">{e.title}</div>
        <div class="muted">{e.subject}</div>
        <div class="small muted">
          {fmtWhen(e.time, now)} · {fmtRelative(e.time, now)}
        </div>
      </div>
      <DoneButton done={done} onToggle={onToggle} />
    </li>
  );
}
