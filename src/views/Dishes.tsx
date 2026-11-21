import { useEffect } from 'preact/hooks';
import type { ViewProps } from '../app';
import { DISH_COLORS, newDish, newStep, uid } from '../store';
import { MIN, fmtDuration, fmtWhen } from '../time';
import { KIND_ICON, KIND_LABEL, needsHands, type Dish, type StepKind } from '../types';
import { NumberField } from '../ui';

const KINDS: StepKind[] = ['prep', 'hob', 'oven', 'rest', 'other'];

export function DishesView(props: ViewProps & { editing: string | null }) {
  const { plan, schedule, mutate, go, editing } = props;

  // "#dishes/new" creates a dish and jumps straight into editing it.
  useEffect(() => {
    if (editing !== 'new') return;
    const dish = newDish(plan.dishes);
    mutate((d) => void d.dishes.push(dish));
    location.replace(`#dishes/${dish.id}`);
  }, [editing]);

  const dish = editing ? plan.dishes.find((d) => d.id === editing) : undefined;
  if (editing && editing !== 'new' && dish) return <DishEditor {...props} dish={dish} />;
  if (editing === 'new') return null;

  const dinner = schedule.dinner;
  return (
    <div class="dishes">
      <h1 class="page-title">Dishes</h1>
      <p class="muted">
        Each dish is a list of steps that run one after another, finishing at dinner time. Tap a dish to edit it.
      </p>
      {plan.dishes.length === 0 && <p class="empty-inline">No dishes yet.</p>}
      <ul class="cards">
        {plan.dishes.map((d) => {
          const total = d.steps.reduce((sum, s) => sum + (s.minutes || 0), 0);
          const first = schedule.slots.find((s) => s.dish.id === d.id);
          return (
            <li key={d.id}>
              <a class="card dish-card" href={`#dishes/${d.id}`} style={{ '--dish': d.color }}>
                <div class="row">
                  <span class="card-title">{d.name || 'Untitled dish'}</span>
                  <span class="grow" />
                  <span class="muted small">{fmtDuration(total)}</span>
                </div>
                <div class="muted small">
                  {first ? <>Start {fmtWhen(first.start, dinner)}</> : 'No steps yet'}
                  {d.finishBefore > 0 && <> · ready {d.finishBefore} min early</>}
                </div>
                <div class="chips">
                  {d.steps.map((s) => (
                    <span key={s.id} class={`chip kind-${s.kind}`}>
                      {KIND_ICON[s.kind]} {s.name || KIND_LABEL[s.kind]} · {s.minutes}m
                    </span>
                  ))}
                </div>
              </a>
            </li>
          );
        })}
      </ul>
      <button type="button" class="btn btn-primary btn-big" onClick={() => go('dishes/new')}>
        + Add a dish
      </button>
    </div>
  );
}

function DishEditor({ plan, schedule, mutate, go, dish }: ViewProps & { dish: Dish }) {
  const unit = plan.settings.unit;
  const dinner = schedule.dinner;
  const edit = (fn: (d: Dish) => void) =>
    mutate((p) => {
      const d = p.dishes.find((x) => x.id === dish.id);
      if (d) fn(d);
    });
  const slots = schedule.slots.filter((s) => s.dish.id === dish.id);
  const total = dish.steps.reduce((sum, s) => sum + (s.minutes || 0), 0);
  const move = (i: number, dir: -1 | 1) =>
    edit((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.steps.length) return;
      [d.steps[i], d.steps[j]] = [d.steps[j], d.steps[i]];
    });

  return (
    <div class="editor">
      <div class="editor-top">
        <button type="button" class="btn btn-link" onClick={() => go('dishes')}>
          ← All dishes
        </button>
      </div>

      <label class="field">
        <span>Dish name</span>
        <input
          type="text"
          value={dish.name}
          placeholder="e.g. Turkey"
          autoFocus={!dish.name}
          onInput={(e) => edit((d) => void (d.name = (e.currentTarget as HTMLInputElement).value))}
        />
      </label>

      <div class="field">
        <span>Colour</span>
        <div class="swatches">
          {DISH_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              class={`swatch ${c === dish.color ? 'is-selected' : ''}`}
              style={{ background: c }}
              aria-label={`Colour ${c}`}
              onClick={() => edit((d) => void (d.color = c))}
            />
          ))}
        </div>
      </div>

      <label class="field">
        <span>Ready how long before dinner?</span>
        <div class="input-suffix">
          <NumberField value={dish.finishBefore} min={0} max={600} onChange={(v) => edit((d) => void (d.finishBefore = v ?? 0))} />
          <span>min</span>
        </div>
        <small class="muted">Leave at 0 to finish right at dinner. Use it for things that need carving or keeping warm.</small>
      </label>

      <div class="block-head">
        <h2>Steps</h2>
        <span class="muted small">
          {fmtDuration(total)} total
          {slots[0] && <> · starts {fmtWhen(slots[0].start, dinner)}</>}
        </span>
      </div>
      <p class="muted small">
        In order, first to last. The last step finishes when the dish is due. Mark steps that need you (chopping, stirring,
        carving) as <strong>🙌 Needs you</strong> and you'll be warned if too many happen at once.
      </p>

      <ol class="steps">
        {dish.steps.map((step, i) => {
          const slot = slots.find((s) => s.step.id === step.id);
          return (
            <li class={`step kind-${step.kind}`} key={step.id}>
              <div class="step-head">
                <span class="step-num">{i + 1}</span>
                <input
                  type="text"
                  class="step-name"
                  value={step.name}
                  placeholder={`e.g. ${['Parboil', 'Roast', 'Rest', 'Chop veg'][i % 4]}`}
                  aria-label="Step name"
                  onInput={(e) => edit((d) => void (d.steps[i].name = (e.currentTarget as HTMLInputElement).value))}
                />
              </div>
              <div class="kind-picker" role="radiogroup" aria-label="Where">
                {KINDS.map((k) => (
                  <button
                    type="button"
                    key={k}
                    role="radio"
                    aria-checked={step.kind === k}
                    class={`kind-opt kind-${k} ${step.kind === k ? 'is-selected' : ''}`}
                    onClick={() => edit((d) => void (d.steps[i].kind = k))}
                  >
                    <span aria-hidden="true">{KIND_ICON[k]}</span>
                    <span>{KIND_LABEL[k]}</span>
                  </button>
                ))}
              </div>
              <div class="step-fields">
                <label class="input-suffix">
                  <NumberField
                    aria-label="Duration in minutes"
                    value={step.minutes}
                    min={0}
                    max={2880}
                    onChange={(v) => edit((d) => void (d.steps[i].minutes = v ?? 0))}
                  />
                  <span>min</span>
                </label>
                {step.kind === 'oven' && (
                  <label class="input-suffix">
                    <NumberField
                      aria-label="Oven temperature"
                      value={step.temp}
                      min={0}
                      max={unit === 'C' ? 300 : 575}
                      placeholder={unit === 'C' ? '180' : '350'}
                      onChange={(v) => edit((d) => void (d.steps[i].temp = v))}
                    />
                    <span>°{unit}</span>
                  </label>
                )}
                <button
                  type="button"
                  class={`hands-btn ${needsHands(step) ? 'is-on' : ''}`}
                  aria-pressed={needsHands(step)}
                  onClick={() => edit((d) => void (d.steps[i].hands = !needsHands(step)))}
                >
                  🙌 {needsHands(step) ? 'Needs you' : 'Hands-off'}
                </button>
              </div>
              <div class="step-foot">
                <span class="muted small">
                  {slot && (
                    <>
                      {fmtWhen(slot.start, dinner)} → {fmtWhen(slot.end, dinner)}
                      {step.minutes >= 60 && <> · {fmtDuration(step.minutes)}</>}
                    </>
                  )}
                </span>
                <span class="step-actions">
                  <button type="button" class="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button type="button" class="icon-btn" aria-label="Move down" disabled={i === dish.steps.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </button>
                  <button type="button" class="icon-btn danger" aria-label="Delete step" onClick={() => edit((d) => void d.steps.splice(i, 1))}>
                    ✕
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        class="btn btn-big"
        onClick={() =>
          edit((d) => {
            const last = d.steps[d.steps.length - 1];
            d.steps.push(newStep(last?.kind === 'oven' ? { kind: 'rest', minutes: 10 } : {}));
          })
        }
      >
        + Add step
      </button>

      <div class="editor-actions">
        <button type="button" class="btn btn-primary btn-big" onClick={() => go('dishes')}>
          Done
        </button>
        <button
          type="button"
          class="btn"
          onClick={() => {
            const copy: Dish = { ...structuredClone(dish), id: uid(), name: `${dish.name} (copy)`, steps: dish.steps.map((s) => ({ ...s, id: uid() })) };
            mutate((p) => void p.dishes.splice(p.dishes.findIndex((d) => d.id === dish.id) + 1, 0, copy));
            go(`dishes/${copy.id}`);
          }}
        >
          Duplicate
        </button>
        <button
          type="button"
          class="btn danger"
          onClick={() => {
            if (!confirm(`Delete ${dish.name || 'this dish'}?`)) return;
            mutate((p) => void (p.dishes = p.dishes.filter((d) => d.id !== dish.id)));
            go('dishes');
          }}
        >
          Delete dish
        </button>
      </div>
      <p class="muted small center">Changes save automatically. {slots.length > 0 && `Finishes ${fmtWhen(dinner - dish.finishBefore * MIN, dinner)}.`}</p>
    </div>
  );
}
