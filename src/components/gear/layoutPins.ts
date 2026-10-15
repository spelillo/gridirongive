export interface PinIn {
  id: string;
  x: number; // 0..1
  y: number; // 0..1
}

export interface PinOut extends PinIn {
  /** Where the pin is drawn, in px. */
  px: number;
  py: number;
  /** The true point, in px. Differs from px/py when the pin was moved. */
  tx: number;
  ty: number;
  moved: boolean;
}

/**
 * Collision handling (ui-ux-spec 6.2): if two pins are within `min` px of each
 * other at the current size, the later one moves outward along the line
 * between them, and a leader line connects it back to its true point.
 */
export function layoutPins(pins: PinIn[], width: number, height: number, min = 40): PinOut[] {
  const out: PinOut[] = [];
  const r = 16;
  for (const p of pins) {
    const tx = p.x * width;
    const ty = p.y * height;
    let px = tx;
    let py = ty;
    for (let pass = 0; pass < 6; pass++) {
      let adjusted = false;
      for (const q of out) {
        const dx = px - q.px;
        const dy = py - q.py;
        const d = Math.hypot(dx, dy);
        if (d < min) {
          // Push away from the earlier pin; straight down when they coincide.
          const ux = d === 0 ? 0 : dx / d;
          const uy = d === 0 ? 1 : dy / d;
          px = q.px + ux * min;
          py = q.py + uy * min;
          adjusted = true;
        }
      }
      if (!adjusted) break;
    }
    px = Math.min(Math.max(px, r), width - r);
    py = Math.min(Math.max(py, r), height - r);
    out.push({ ...p, px, py, tx, ty, moved: Math.hypot(px - tx, py - ty) > 1 });
  }
  return out;
}
