/**
 * Team colors a coach can pick. Each one carries white text at 4.5:1 or
 * better, so buttons and banners in the team's color stay readable.
 */
export const TEAM_COLORS = [
  { name: 'Royal', hex: '#1d4ed8' },
  { name: 'Navy', hex: '#1e3a8a' },
  { name: 'Purple', hex: '#4c1d95' },
  { name: 'Maroon', hex: '#7f1d1d' },
  { name: 'Crimson', hex: '#9f1239' },
  { name: 'Red', hex: '#b91c1c' },
  { name: 'Burnt orange', hex: '#9a3412' },
  { name: 'Forest', hex: '#166534' },
  { name: 'Teal', hex: '#0f766e' },
  { name: 'Columbia', hex: '#0e7490' },
  { name: 'Slate', hex: '#334155' },
  { name: 'Black', hex: '#18181b' },
] as const;

export const DEFAULT_TEAM_COLOR = '#0b3fb3';

function rgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as [number, number, number];
}

function mix(hex: string, to: [number, number, number], t: number) {
  const c = rgb(hex);
  return `#${c.map((v, i) => Math.round(v + (to[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** CSS custom properties for a team-colored surface. */
export function teamVars(color: string | null | undefined): Record<string, string> {
  const c = color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_TEAM_COLOR;
  return {
    '--team': c,
    '--team-deep': mix(c, [0, 0, 0], 0.45),
    '--team-night': mix(c, [6, 10, 20], 0.72),
    '--team-soft': mix(c, [255, 255, 255], 0.92),
    '--team-line': mix(c, [255, 255, 255], 0.75),
  };
}
