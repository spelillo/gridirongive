import { describe, it, expect } from 'vitest';
import { layoutPins } from '@/components/gear/layoutPins';

const dist = (a: { px: number; py: number }, b: { px: number; py: number }) => Math.hypot(a.px - b.px, a.py - b.py);

describe('layoutPins', () => {
  it('places pins at their true point when they are far apart', () => {
    const out = layoutPins([{ id: 'a', x: 0.5, y: 0.1 }, { id: 'b', x: 0.5, y: 0.9 }], 400, 600);
    expect(out[0]).toEqual({ id: 'a', x: 0.5, y: 0.1, px: 200, py: 60, tx: 200, ty: 60, moved: false });
    expect(out[1]).toMatchObject({ px: 200, py: 540, tx: 200, ty: 540, moved: false });
  });

  it('pushes a later pin outward along the line between them', () => {
    const out = layoutPins([{ id: 'a', x: 0.5, y: 0.5 }, { id: 'b', x: 0.55, y: 0.5 }], 400, 400);
    expect(out[0].moved).toBe(false);
    expect(out[1].py).toBeCloseTo(200);
    expect(out[1].px).toBeCloseTo(240);
    expect(out[1].moved).toBe(true);
    expect(out[1].tx).toBeCloseTo(220);
    expect(dist(out[0], out[1])).toBeCloseTo(40);
  });

  it('moves a coinciding pin straight down', () => {
    const out = layoutPins([{ id: 'a', x: 0.5, y: 0.5 }, { id: 'b', x: 0.5, y: 0.5 }], 400, 400);
    expect(out[1]).toMatchObject({ px: 200, py: 240, tx: 200, ty: 200, moved: true });
  });

  it('respects a custom minimum distance', () => {
    const out = layoutPins([{ id: 'a', x: 0.5, y: 0.5 }, { id: 'b', x: 0.5, y: 0.5 }], 400, 400, 60);
    expect(out[1].py).toBe(260);
  });

  it('keeps pins inside the image', () => {
    const out = layoutPins([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 1 }], 300, 200);
    expect(out[0]).toMatchObject({ px: 16, py: 16, tx: 0, ty: 0, moved: true });
    expect(out[1]).toMatchObject({ px: 284, py: 184, tx: 300, ty: 200 });
  });

  it('separates a cluster of pins (the Gloves and Girdle style overlap)', () => {
    const pins = [
      { id: 'helmet', x: 0.5, y: 0.1 }, { id: 'mouthguard', x: 0.52, y: 0.12 }, { id: 'jersey', x: 0.5, y: 0.14 }, { id: 'pads', x: 0.48, y: 0.12 },
    ];
    const out = layoutPins(pins, 400, 800);
    for (let i = 0; i < out.length; i++) for (let j = 0; j < i; j++) expect(dist(out[i], out[j])).toBeGreaterThan(39.9);
    expect(out.map((p) => p.id)).toEqual(['helmet', 'mouthguard', 'jersey', 'pads']);
  });

  it('returns an empty list for no pins', () => {
    expect(layoutPins([], 400, 400)).toEqual([]);
  });
});
