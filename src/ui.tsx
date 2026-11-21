import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PlanEvent } from './schedule';
import { KIND_ICON } from './types';

export function eventIcon(e: PlanEvent): string {
  switch (e.type) {
    case 'preheat':
    case 'oven-temp':
      return '🌡️';
    case 'ready':
      return '✅';
    case 'dinner':
      return '🍽️';
    default:
      return e.kind ? KIND_ICON[e.kind] : '📌';
  }
}

/** Number input that lets you clear and retype without fighting you. */
export function NumberField(props: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  id?: string;
  class?: string;
  'aria-label'?: string;
}) {
  const { value, onChange, min, max, ...rest } = props;
  const [text, setText] = useState(value == null ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value == null ? '' : String(value));
  }, [value]);
  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        (e.currentTarget as HTMLInputElement).select();
      }}
      onBlur={() => {
        focused.current = false;
        setText(value == null ? '' : String(value));
      }}
      onInput={(e) => {
        const raw = (e.currentTarget as HTMLInputElement).value;
        setText(raw);
        if (raw.trim() === '') return onChange(undefined);
        let n = Number(raw);
        if (!Number.isFinite(n)) return;
        if (min != null) n = Math.max(min, n);
        if (max != null) n = Math.min(max, n);
        onChange(n);
      }}
    />
  );
}

export function Toggle(props: { label: ComponentChildren; hint?: ComponentChildren; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label class={`toggle ${props.disabled ? 'is-disabled' : ''}`}>
      <span class="toggle-text">
        <span>{props.label}</span>
        {props.hint && <small>{props.hint}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange((e.currentTarget as HTMLInputElement).checked)}
      />
      <span class="switch" aria-hidden="true" />
    </label>
  );
}

export function DoneButton(props: { done: boolean; onToggle: () => void; label?: string }) {
  return (
    <button
      type="button"
      class={`done-btn ${props.done ? 'is-done' : ''}`}
      aria-pressed={props.done}
      aria-label={props.done ? 'Mark as not done' : 'Mark as done'}
      onClick={props.onToggle}
    >
      {props.done ? '✓' : props.label ?? ''}
    </button>
  );
}
