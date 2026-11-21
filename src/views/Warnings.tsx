import { useState } from 'preact/hooks';
import type { Schedule } from '../schedule';

const ICON = { temp: '🌡️', 'oven-full': '🔥', 'hob-full': '🍳', 'hands-full': '🙌', late: '⏰' } as const;

export function Warnings({ schedule, now, compact }: { schedule: Schedule; now: number; compact?: boolean }) {
  // On the Now screen lateness has its own banner, and past clashes no longer matter.
  const list = compact ? schedule.warnings.filter((w) => w.end > now && w.type !== 'late') : schedule.warnings;
  const [open, setOpen] = useState(!compact);
  if (!list.length) return null;
  return (
    <section class="warnings" role="alert">
      <button type="button" class="warnings-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          ⚠️ {list.length} kitchen {list.length === 1 ? 'clash' : 'clashes'}
        </span>
        <span class="chev">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul>
          {list.map((w) => (
            <li key={w.id}>
              <span>{ICON[w.type]}</span> {w.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
