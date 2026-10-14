export interface NameParts {
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
  show_full_last_name?: boolean | null;
}

/** "Jayden S." by default. The full last name only with guardian opt-in. */
export function athleteDisplayName(a: NameParts, preferred?: string | null): string {
  const first = (preferred ?? a.preferred_name ?? '').trim() || a.first_name.trim();
  const last = a.last_name.trim();
  if (!last) return first;
  return a.show_full_last_name ? `${first} ${last}` : `${first} ${last[0].toUpperCase()}.`;
}

export function firstName(a: NameParts, preferred?: string | null): string {
  return (preferred ?? a.preferred_name ?? '').trim() || a.first_name.trim();
}

/** Possessive for copy: "Jayden's", "Chris'". */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** "jayden-s-12". Unique within a team; the caller adds a suffix on collision. */
export function athleteSlug(first: string, last: string, jersey?: string | null): string {
  return slugify([first, last.slice(0, 1), jersey].filter(Boolean).join(' ')) || 'player';
}

export const POSITION_GROUPS: Record<string, 'offense' | 'defense' | 'special'> = {
  QB: 'offense', RB: 'offense', FB: 'offense', WR: 'offense', TE: 'offense', OL: 'offense', C: 'offense', G: 'offense', T: 'offense',
  DL: 'defense', DE: 'defense', DT: 'defense', NT: 'defense', LB: 'defense', CB: 'defense', S: 'defense', DB: 'defense', FS: 'defense', SS: 'defense',
  K: 'special', P: 'special', LS: 'special', KR: 'special', PR: 'special',
};

export const POSITION_NAMES: Record<string, string> = {
  QB: 'Quarterback', RB: 'Running back', FB: 'Fullback', WR: 'Wide receiver', TE: 'Tight end', OL: 'Offensive line',
  C: 'Center', G: 'Guard', T: 'Tackle', DL: 'Defensive line', DE: 'Defensive end', DT: 'Defensive tackle', NT: 'Nose tackle',
  LB: 'Linebacker', CB: 'Cornerback', S: 'Safety', DB: 'Defensive back', FS: 'Free safety', SS: 'Strong safety',
  K: 'Kicker', P: 'Punter', LS: 'Long snapper', KR: 'Kick returner', PR: 'Punt returner',
};

export function positionGroup(position: string | null | undefined): 'offense' | 'defense' | 'special' | null {
  if (!position) return null;
  return POSITION_GROUPS[position.toUpperCase().split(/[/, ]/)[0]] ?? null;
}

export function gradeLabel(grade: number | null | undefined): string {
  if (!grade) return '';
  return ({ 9: 'Freshman', 10: 'Sophomore', 11: 'Junior', 12: 'Senior' } as Record<number, string>)[grade] ?? `Grade ${grade}`;
}

/** Without a birthdate we treat grade 7 and below as under 13. Staff can override. */
export function defaultUnder13(grade: number | null | undefined, level: string): boolean {
  if (grade) return grade <= 7;
  return level === 'youth';
}
