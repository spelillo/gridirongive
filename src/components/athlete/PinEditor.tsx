'use client';
import { useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

export interface PinItem {
  id: string;
  number: number;
  name: string;
  x: number | null;
  y: number | null;
}

/**
 * Pin placement editor (ui-ux-spec 6.4). Tap an item chip, then tap the
 * photo. Drag a pin to move it. The selected pin can be nudged with arrow
 * keys or removed. Zoom 1x to 3x; pins keep their size.
 */
export function PinEditor({ open, onClose, photoSrc, items, onSave }: { open: boolean; onClose: () => void; photoSrc: string; items: PinItem[]; onSave: (pins: PinItem[]) => Promise<boolean> }) {
  const [pins, setPins] = useState(items);
  const [selected, setSelected] = useState<string | null>(items.find((i) => i.x === null)?.id ?? null);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ id: string; moved: boolean } | null>(null);
  const dirty = useMemo(() => JSON.stringify(pins) !== JSON.stringify(items), [pins, items]);
  const unplaced = pins.filter((p) => p.x === null);
  const sel = pins.find((p) => p.id === selected) ?? null;

  const pointFrom = (e: { clientX: number; clientY: number }) => {
    const r = surface.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const place = (id: string, p: { x: number; y: number }) => {
    setPins((list) => list.map((i) => (i.id === id ? { ...i, x: +p.x.toFixed(4), y: +p.y.toFixed(4) } : i)));
    if ('vibrate' in navigator) navigator.vibrate?.(8);
  };

  const onSurfaceClick = (e: React.MouseEvent) => {
    if (dragging.current?.moved) return;
    if (!sel) return;
    place(sel.id, pointFrom(e));
    const next = pins.find((p) => p.x === null && p.id !== sel.id);
    if (sel.x === null) setSelected(next?.id ?? sel.id);
  };

  const close = () => {
    if (dirty && !confirmDiscard) return setConfirmDiscard(true);
    setConfirmDiscard(false);
    setPins(items);
    onClose();
  };

  const save = async () => {
    setSaving(true);
    const ok = await onSave(pins);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Place gear on the photo"
      size="xl"
      footer={
        confirmDiscard ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-3">
            <p className="mr-auto text-[15px] text-ink-body">Discard your changes?</p>
            <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
            <Button variant="destructive" onClick={close}>
              Discard
            </Button>
          </div>
        ) : (
          <div className="flex w-full justify-end gap-3">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} loadingLabel="Saving">
              Done
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex flex-col gap-2 md:w-[55%]">
          <div className="max-h-[60vh] overflow-auto rounded-lg bg-band" style={{ touchAction: zoom > 1 ? 'pan-x pan-y' : 'manipulation' }}>
            <div
              ref={surface}
              className="relative aspect-[3/4] cursor-crosshair select-none"
              style={{ width: `${zoom * 100}%` }}
              onClick={onSurfaceClick}
              role="presentation"
            >
              <img src={photoSrc} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-cover" />
              {pins
                .filter((p) => p.x !== null)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-label={`${p.number}, ${p.name}. Arrow keys move it.`}
                    aria-pressed={selected === p.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!dragging.current?.moved) setSelected(p.id);
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      dragging.current = { id: p.id, moved: false };
                      setSelected(p.id);
                    }}
                    onPointerMove={(e) => {
                      if (dragging.current?.id !== p.id) return;
                      dragging.current.moved = true;
                      place(p.id, pointFrom(e));
                    }}
                    onPointerUp={() => setTimeout(() => (dragging.current = null), 0)}
                    onKeyDown={(e) => {
                      const d = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] }[e.key];
                      if (d) {
                        e.preventDefault();
                        place(p.id, { x: Math.min(1, Math.max(0, p.x! + d[0])), y: Math.min(1, Math.max(0, p.y! + d[1])) });
                      }
                      if (e.key === 'Delete' || e.key === 'Backspace') {
                        e.preventDefault();
                        setPins((list) => list.map((i) => (i.id === p.id ? { ...i, x: null, y: null } : i)));
                      }
                    }}
                    className="absolute flex size-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center"
                    style={{ left: `${p.x! * 100}%`, top: `${p.y! * 100}%` }}
                  >
                    <span
                      className={cn(
                        'flex size-8 items-center justify-center rounded-full bg-canvas text-[14px] font-medium text-primary tabular shadow-[0_1px_3px_rgba(0,0,0,.35)]',
                        selected === p.id ? 'border-[3px] border-primary ring-4 ring-white' : 'border-2 border-primary',
                      )}
                    >
                      {p.number}
                    </span>
                  </button>
                ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Zoom out" disabled={zoom <= 1} className="flex size-11 items-center justify-center rounded-md text-ink-nav hover:bg-band disabled:opacity-40" onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
              <ZoomOut size={20} aria-hidden />
            </button>
            <span className="t-caption w-10 text-center tabular">{zoom}x</span>
            <button type="button" aria-label="Zoom in" disabled={zoom >= 3} className="flex size-11 items-center justify-center rounded-md text-ink-nav hover:bg-band disabled:opacity-40" onClick={() => setZoom((z) => Math.min(3, z + 0.5))}>
              <ZoomIn size={20} aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4">
          <p className="t-body">{unplaced.length ? 'Tap an item, then tap the photo where it goes.' : 'Every item is on the photo. Drag a marker to move it.'}</p>
          <ul className="flex flex-wrap gap-2" aria-label="Items">
            {pins.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={selected === p.id}
                  onClick={() => setSelected(p.id)}
                  className={cn(
                    'flex min-h-11 items-center gap-2 rounded-md border px-3 text-[15px]',
                    selected === p.id ? 'border-primary bg-band-blue text-ink' : 'border-hairline-soft text-ink-list hover:border-hairline',
                  )}
                >
                  <span className={cn('flex size-6 items-center justify-center rounded-full text-[12px] font-medium tabular', p.x === null ? 'border border-hairline text-ink-meta' : 'bg-primary text-white')}>{p.number}</span>
                  {p.name}
                  {p.x === null && <span className="sr-only">(not placed)</span>}
                </button>
              </li>
            ))}
          </ul>
          {sel && (
            <div className="flex flex-wrap items-center gap-3 rounded-md bg-chrome p-3">
              <p className="flex-1 text-[15px] text-ink-body">
                <span className="font-medium text-ink">
                  {sel.number}. {sel.name}
                </span>{' '}
                {sel.x === null ? 'Tap the photo to place it.' : 'Placed. Drag it, or use arrow keys to nudge.'}
              </p>
              {sel.x !== null && (
                <Button variant="tertiary" size="sm" onClick={() => setPins((list) => list.map((i) => (i.id === sel.id ? { ...i, x: null, y: null } : i)))}>
                  <Trash2 size={16} aria-hidden /> Remove marker
                </Button>
              )}
            </div>
          )}
          <p className="t-caption">Markers don&apos;t need coach approval. Items without a marker still show in the gear list.</p>
        </div>
      </div>
    </Sheet>
  );
}
