/**
 * Roster import: column mapping and row checks (ui-ux-spec 8.4). Shared by the
 * browser (live review table) and the server (re-validated before insert).
 */
import { positionGroup } from './names';

export const IMPORT_FIELDS = [
  { key: 'first_name', label: 'First name', required: true },
  { key: 'last_name', label: 'Last name', required: true },
  { key: 'jersey', label: 'Number', required: false },
  { key: 'position', label: 'Position', required: false },
  { key: 'grade', label: 'Grade', required: false },
  { key: 'guardian_email', label: 'Guardian email', required: false },
  { key: 'athlete_email', label: 'Athlete email', required: false },
  { key: 'guardian_phone', label: 'Guardian phone', required: false },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]['key'];
export type ColumnMap = Partial<Record<ImportField, number>>;

const HEADER_ALIASES: Record<ImportField, string[]> = {
  first_name: ['first', 'first name', 'firstname', 'given name', 'player first', 'first_name'],
  last_name: ['last', 'last name', 'lastname', 'surname', 'family name', 'player last', 'last_name'],
  jersey: ['number', 'no', 'no.', '#', 'jersey', 'jersey #', 'jersey number', 'jersey no'],
  position: ['position', 'pos', 'pos.'],
  grade: ['grade', 'class', 'yr', 'year', 'grade level'],
  guardian_email: ['guardian email', 'parent email', 'guardian e-mail', 'parent e-mail', 'parent/guardian email', 'guardian_email'],
  athlete_email: ['athlete email', 'player email', 'student email', 'email', 'e-mail', 'athlete_email'],
  guardian_phone: ['guardian phone', 'parent phone', 'phone', 'cell', 'guardian_phone'],
};

function norm(h: string) {
  return h.replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function autoMapColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const used = new Set<number>();
  // Specific aliases first so "Guardian email" isn't claimed by plain "email".
  const order: ImportField[] = ['guardian_email', 'guardian_phone', 'athlete_email', 'first_name', 'last_name', 'jersey', 'position', 'grade'];
  for (const field of order) {
    const idx = headers.findIndex((h, i) => !used.has(i) && HEADER_ALIASES[field].includes(norm(h)));
    if (idx >= 0) {
      map[field] = idx;
      used.add(idx);
    }
  }
  return map;
}

export interface ImportRow {
  first_name: string;
  last_name: string;
  jersey: string;
  position: string;
  grade: number | null;
  guardian_email: string;
  athlete_email: string;
  guardian_phone: string;
}

export interface RowCheck {
  row: ImportRow;
  level: 'ready' | 'warning' | 'error';
  issues: string[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseGrade(raw: string): number | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  const named: Record<string, number> = { freshman: 9, fr: 9, sophomore: 10, so: 10, soph: 10, junior: 11, jr: 11, senior: 12, sr: 12 };
  if (named[t]) return named[t];
  const n = parseInt(t.replace(/(st|nd|rd|th)$/, ''), 10);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

export function rowFromCells(cells: string[], map: ColumnMap): ImportRow {
  const get = (f: ImportField) => (map[f] === undefined ? '' : String(cells[map[f]!] ?? '').trim());
  return {
    first_name: get('first_name'),
    last_name: get('last_name'),
    jersey: get('jersey').replace(/^#/, ''),
    position: get('position').toUpperCase(),
    grade: parseGrade(get('grade')),
    guardian_email: get('guardian_email').toLowerCase(),
    athlete_email: get('athlete_email').toLowerCase(),
    guardian_phone: get('guardian_phone'),
  };
}

export interface ExistingAthlete {
  first_name: string;
  last_name: string;
  jersey: string | null;
  guardian_email?: string | null;
  athlete_email?: string | null;
}

function key(first: string, last: string, jersey: string | null | undefined) {
  return `${first.trim().toLowerCase()}|${last.trim().toLowerCase()}|${(jersey ?? '').trim()}`;
}

export function checkRows(rows: ImportRow[], existing: ExistingAthlete[] = []): RowCheck[] {
  const existingKeys = new Set(existing.map((e) => key(e.first_name, e.last_name, e.jersey)));
  const existingEmails = new Set(
    existing.flatMap((e) => [e.guardian_email, e.athlete_email]).filter(Boolean).map((e) => e!.toLowerCase()),
  );
  const numberCounts = new Map<string, number>();
  for (const r of rows) if (r.jersey) numberCounts.set(r.jersey, (numberCounts.get(r.jersey) ?? 0) + 1);
  const existingNumbers = new Set(existing.map((e) => (e.jersey ?? '').trim()).filter(Boolean));

  return rows.map((row) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!row.first_name) errors.push('First name is missing.');
    if (!row.last_name) errors.push('Last name is missing.');
    if (row.guardian_email && !EMAIL.test(row.guardian_email)) errors.push('Guardian email is not valid.');
    if (row.athlete_email && !EMAIL.test(row.athlete_email)) errors.push('Athlete email is not valid.');
    if (row.jersey && !/^\d{1,2}$/.test(row.jersey)) warnings.push('Number should be 0 to 99.');
    if (row.jersey && ((numberCounts.get(row.jersey) ?? 0) > 1 || existingNumbers.has(row.jersey))) warnings.push(`Number ${row.jersey} is used more than once.`);
    if (row.first_name && row.last_name && existingKeys.has(key(row.first_name, row.last_name, row.jersey))) errors.push('Already on the roster.');
    else if ([row.guardian_email, row.athlete_email].some((e) => e && existingEmails.has(e))) warnings.push('An athlete with this email is already on the roster.');
    if (!row.guardian_email) warnings.push('No guardian email, so no invite can be sent.');
    if (row.position && !positionGroup(row.position)) warnings.push(`Position "${row.position}" isn't a standard abbreviation.`);
    return {
      row,
      level: errors.length ? 'error' : warnings.length ? 'warning' : 'ready',
      issues: [...errors, ...warnings],
    };
  });
}

export const TEMPLATE_CSV =
  'First name,Last name,Number,Position,Grade,Guardian email,Athlete email,Guardian phone\n' +
  'Jayden,Smith,12,QB,12,parent@example.com,,555-0100\n';
