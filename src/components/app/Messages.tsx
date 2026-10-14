'use client';
import { useState } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';
import { Textarea } from '@/components/ui/Field';

/** Prewritten, editable messages with one-tap copy (ui-ux-spec 7.7, 8.11). */
export function Messages({ items, surface }: { items: { id: string; label: string; text: string }[]; surface: string }) {
  const [values, setValues] = useState(() => Object.fromEntries(items.map((i) => [i.id, i.text])));
  return (
    <div className="flex flex-col gap-5">
      {items.map((m) => (
        <div key={m.id} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={`msg-${m.id}`} className="t-label">
              {m.label}
            </label>
            <CopyButton value={values[m.id]} label="Copy" variant="tertiary" surface={surface} />
          </div>
          <Textarea id={`msg-${m.id}`} value={values[m.id]} onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))} rows={m.text.length > 200 ? 6 : 3} />
        </div>
      ))}
    </div>
  );
}
