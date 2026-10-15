'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';

const OUT_W = 900;
const OUT_H = 1200;

/**
 * Photo picker with a 3:4 crop (ui-ux-spec 7.3 step 2). Drag to position,
 * zoom with the slider or buttons, arrow keys nudge. The result is re-encoded
 * in the browser, which strips EXIF data such as location, and is sent as WebP
 * (or JPEG where WebP encoding isn't supported).
 */
export function PhotoCropper({ uploadUrl, onDone, onCancel }: { uploadUrl: string; onDone: () => void; onCancel?: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) return setError('Choose a photo file.');
    if (file.size > 15 * 1024 * 1024) return setError('That photo is over 15 MB. Choose a smaller one.');
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      setImg(el);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    el.onerror = () => setError("This browser can't open that photo. Try a JPG or PNG, or take a screenshot of it.");
    el.src = url;
  };

  // Frame size is measured, so geometry can be computed during render.
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrame({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [img]);

  // Geometry: the image covers the frame at zoom 1; offset is in frame pixels from center.
  const geometry = useCallback(() => {
    if (!img || !frame) return null;
    const cover = Math.max(frame.w / img.naturalWidth, frame.h / img.naturalHeight);
    const scale = cover * zoom;
    return { fw: frame.w, fh: frame.h, w: img.naturalWidth * scale, h: img.naturalHeight * scale, scale };
  }, [img, zoom, frame]);

  const clamp = useCallback(
    (o: { x: number; y: number }) => {
      const g = geometry();
      if (!g) return o;
      const mx = Math.max(0, (g.w - g.fw) / 2);
      const my = Math.max(0, (g.h - g.fh) / 2);
      return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
    },
    [geometry],
  );
  // Zooming out can leave the stored offset out of range; what's shown is always clamped.
  const shown = clamp(offset);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: shown.x, oy: shown.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset(clamp({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y }));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 30 : 10;
    const d = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (d) {
      e.preventDefault();
      setOffset(clamp({ x: shown.x + d[0], y: shown.y + d[1] }));
    }
    if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(3, z + 0.1));
    if (e.key === '-') setZoom((z) => Math.max(1, z - 0.1));
  };

  const save = async () => {
    const g = geometry();
    if (!img || !g) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      const ctx = canvas.getContext('2d')!;
      // Source rectangle in image pixels that's visible in the frame.
      const sx = (g.w / 2 - g.fw / 2 - shown.x) / g.scale;
      const sy = (g.h / 2 - g.fh / 2 - shown.y) / g.scale;
      const sw = g.fw / g.scale;
      const sh = g.fh / g.scale;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);
      let blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.85));
      if (!blob || blob.type !== 'image/webp') blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
      if (!blob) throw new Error('Could not prepare the photo.');
      const body = new FormData();
      body.append('photo', blob, blob.type === 'image/webp' ? 'photo.webp' : 'photo.jpg');
      const res = await fetch(uploadUrl, { method: 'POST', body });
      const data = await res.json().catch(() => null);
      if (!data?.ok) throw new Error(data?.error ?? 'Upload failed. Try again.');
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const g = geometry();
  return (
    <div className="flex flex-col gap-4">
      {error && <Banner tone="error">{error}</Banner>}
      <input ref={inputRef} type="file" accept="image/*,.heic,.heif" className="sr-only" id="photo-input" onChange={(e) => pick(e.target.files?.[0])} />
      {!img ? (
        <label
          htmlFor="photo-input"
          className="flex aspect-[3/4] w-full max-w-[300px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-hairline-soft bg-chrome px-6 text-center hover:border-primary"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files?.[0]);
          }}
        >
          <ImagePlus size={32} strokeWidth={1.5} aria-hidden className="text-primary" />
          <span className="text-[16px] font-medium text-primary">Choose or take a photo</span>
          <span className="t-caption">A clear photo, standing, ideally in uniform. Face visible.</span>
        </label>
      ) : (
        <>
          <div
            ref={frameRef}
            role="application"
            aria-label="Photo crop. Drag or use arrow keys to move, plus and minus to zoom."
            tabIndex={0}
            onKeyDown={onKey}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            className="relative aspect-[3/4] w-full max-w-[300px] cursor-grab touch-none overflow-hidden rounded-lg bg-ink active:cursor-grabbing"
          >
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={g ? { width: g.w, height: g.h, transform: `translate(calc(-50% + ${shown.x}px), calc(-50% + ${shown.y}px))` } : { width: '100%' }}
            />
            <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} className="border border-white/25" />
              ))}
            </div>
          </div>
          <div className="flex max-w-[300px] items-center gap-2">
            <button type="button" aria-label="Zoom out" className="flex size-11 items-center justify-center rounded-md text-ink-nav hover:bg-band" onClick={() => setZoom((z) => Math.max(1, +(z - 0.2).toFixed(2)))}>
              <ZoomOut size={20} aria-hidden />
            </button>
            <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(+e.target.value)} aria-label="Zoom" className="flex-1 accent-primary" />
            <button type="button" aria-label="Zoom in" className="flex size-11 items-center justify-center rounded-md text-ink-nav hover:bg-band" onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))}>
              <ZoomIn size={20} aria-hidden />
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={save} loading={busy} loadingLabel="Uploading">
              Use this photo
            </Button>
            <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
              Choose another
            </Button>
            {onCancel && (
              <Button variant="tertiary" onClick={onCancel} disabled={busy}>
                Cancel
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
