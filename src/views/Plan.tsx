import { Fragment } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { ViewProps } from '../app';
import { MIN, fmtDuration, fmtLongDate, fmtTime, fmtWhen } from '../time';
import { KIND_ICON, KIND_LABEL, needsHands, type StepKind } from '../types';
import { DoneButton, eventIcon } from '../ui';
import { Warnings } from './Warnings';

const PX_PER_MIN = 2.4;
const STEP = 30 * MIN;

export function PlanView({ plan, schedule, now, go, toggleDone }: ViewProps) {
  const { dinner, events, slots } = schedule;
  const scroller = useRef<HTMLDivElement>(null);

  const ends = slots.map((s) => s.end);
  const t0 = Math.floor(schedule.start / STEP) * STEP;
  const t1 = Math.ceil(Math.max(dinner, ...ends) / STEP) * STEP + STEP / 2;
  const x = (t: number) => ((t - t0) / MIN) * PX_PER_MIN;
  const width = x(t1);
  const ticks: number[] = [];
  for (let t = t0; t <= t1; t += STEP) ticks.push(t);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = now > t0 && now < t1 ? x(now) : 0;
    el.scrollLeft = Math.max(0, target - el.clientWidth / 3);
  }, []); // only when the view first opens

  if (!plan.dishes.length) {
    return (
      <div class="empty">
        <div class="empty-art">🗓️</div>
        <h1>No plan yet</h1>
        <p>Add some dishes and your timeline will appear here.</p>
        <button type="button" class="btn btn-primary btn-big" onClick={() => go('dishes/new')}>
          Add a dish
        </button>
      </div>
    );
  }

  const firstFuture = events.findIndex((e) => e.time > now);
  const kinds: StepKind[] = ['prep', 'hob', 'oven', 'rest', 'other'];

  return (
    <div class="plan">
      <h1 class="page-title">The plan</h1>
      <p class="muted">
        Dinner at <strong>{fmtTime(dinner)}</strong>, {fmtLongDate(dinner)}. Cooking starts {fmtWhen(schedule.start, dinner)},{' '}
        {fmtDuration((dinner - schedule.start) / MIN)} before.
      </p>

      <Warnings schedule={schedule} now={now} />

      <div class="gantt" ref={scroller}>
        <div class="gantt-inner" style={{ width: `calc(var(--label-w) + ${width}px)` }}>
          <div class="g-axis">
            <div class="g-label" />
            <div class="g-track">
              {ticks.map((t) => (
                <span key={t} class="g-tick" style={{ left: `${x(t)}px` }}>
                  {fmtTime(t)}
                </span>
              ))}
            </div>
          </div>
          {plan.dishes.map((dish) => (
            <div class="g-row" key={dish.id}>
              <button type="button" class="g-label" style={{ '--dish': dish.color }} onClick={() => go(`dishes/${dish.id}`)}>
                {dish.name || 'Untitled'}
              </button>
              <div class="g-track" style={{ backgroundSize: `${(STEP / MIN) * PX_PER_MIN}px 100%` }}>
                {slots
                  .filter((s) => s.dish.id === dish.id)
                  .map((s) => (
                    <div
                      key={s.step.id}
                      class={`g-bar kind-${s.step.kind} ${needsHands(s.step) ? 'is-hands' : ''}`}
                      style={{ left: `${x(s.start)}px`, width: `${Math.max(3, x(s.end) - x(s.start))}px` }}
                      title={`${s.step.name || KIND_LABEL[s.step.kind]}: ${fmtTime(s.start)}–${fmtTime(s.end)}`}
                    >
                      <span>
                        {needsHands(s.step) ? '🙌' : KIND_ICON[s.step.kind]} {s.step.name || KIND_LABEL[s.step.kind]}
                        {s.step.kind === 'oven' && s.step.temp != null ? ` ${s.step.temp}°` : ''}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
          <div class="g-overlay" style={{ left: 'var(--label-w)' }}>
            {schedule.warnings.filter((w) => w.type !== 'late').map((w) => (
              <div key={w.id} class="g-warn" style={{ left: `${x(w.start)}px`, width: `${Math.max(2, x(w.end) - x(w.start))}px` }} />
            ))}
            <div class="g-line g-dinner" style={{ left: `${x(dinner)}px` }}>
              <span>🍽️</span>
            </div>
            {now >= t0 && now <= t1 && (
              <div class="g-line g-now" style={{ left: `${x(now)}px` }}>
                <span>now</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div class="legend">
        {kinds.map((k) => (
          <span key={k} class={`legend-item kind-${k}`}>
            <i /> {KIND_LABEL[k]}
          </span>
        ))}
        <span class="legend-item legend-hands">🙌 Needs you</span>
        <span class="legend-item legend-warn">
          <i /> Clash
        </span>
      </div>

      <h2>Step by step</h2>
      <ol class="timeline">
        {events.map((e, i) => {
          const past = e.time <= now;
          const done = !!plan.done[e.id];
          return (
            <Fragment key={e.id}>
              {i === firstFuture && firstFuture > 0 && (
                <li class="now-divider" key="now">
                  <span>Now · {fmtTime(now)}</span>
                </li>
              )}
              <li class={`tl-item ${past ? 'is-past' : ''} ${done ? 'is-done' : ''} type-${e.type}`} style={{ '--dish': e.color ?? 'var(--accent)' }}>
                <span class="tl-time">{fmtWhen(e.time, dinner)}</span>
                <span class="tl-dot">{eventIcon(e)}</span>
                <span class="tl-text">
                  <strong>{e.title}</strong>
                  <span>{e.subject}</span>
                  {e.until && e.until > e.time && <small>{fmtDuration((e.until - e.time) / MIN)}</small>}
                </span>
                {e.type !== 'dinner' && (
                  <DoneButton done={done} onToggle={() => toggleDone(e)} />
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}
