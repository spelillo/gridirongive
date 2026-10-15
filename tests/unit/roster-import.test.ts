import { describe, it, expect } from 'vitest';
import { autoMapColumns, parseGrade, rowFromCells, checkRows, IMPORT_FIELDS, TEMPLATE_CSV, type ImportRow } from '@/lib/domain/roster-import';

const row = (o: Partial<ImportRow> = {}): ImportRow => ({
  first_name: 'Jayden', last_name: 'Smith', jersey: '12', position: 'QB', grade: 12,
  guardian_email: 'pat.smith@example.com', athlete_email: '', guardian_phone: '', ...o,
});

describe('autoMapColumns', () => {
  it('maps the template headers', () => {
    const headers = TEMPLATE_CSV.split('\n')[0].split(',');
    expect(autoMapColumns(headers)).toEqual({
      first_name: 0, last_name: 1, jersey: 2, position: 3, grade: 4, guardian_email: 5, athlete_email: 6, guardian_phone: 7,
    });
  });

  it('handles varied spellings, case, spacing and a BOM', () => {
    const headers = ['﻿Player First', 'SURNAME', ' #', 'Pos.', 'Class', 'Parent E-mail', 'Cell'];
    expect(autoMapColumns(headers)).toEqual({ first_name: 0, last_name: 1, jersey: 2, position: 3, grade: 4, guardian_email: 5, guardian_phone: 6 });
  });

  it('does not let plain "email" claim the guardian email column', () => {
    expect(autoMapColumns(['First', 'Last', 'Email', 'Guardian Email'])).toEqual({ first_name: 0, last_name: 1, athlete_email: 2, guardian_email: 3 });
    expect(autoMapColumns(['Guardian Email', 'Email'])).toEqual({ guardian_email: 0, athlete_email: 1 });
  });

  it('collapses inner whitespace', () => {
    expect(autoMapColumns(['First   name', 'Jersey  Number'])).toEqual({ first_name: 0, jersey: 1 });
  });

  it('uses each column once and leaves unknown headers unmapped', () => {
    const m = autoMapColumns(['Email', 'Email', 'Shoe size', 'Notes']);
    expect(m).toEqual({ athlete_email: 0 });
  });

  it('returns an empty map for no headers', () => {
    expect(autoMapColumns([])).toEqual({});
  });

  it('lists the two required fields', () => {
    expect(IMPORT_FIELDS.filter((f) => f.required).map((f) => f.key)).toEqual(['first_name', 'last_name']);
  });
});

describe('parseGrade', () => {
  it.each([
    ['12', 12], ['9', 9], ['9th', 9], ['11th', 11], ['1st', 1], ['2nd', 2], ['3rd', 3],
    ['Freshman', 9], ['fr', 9], ['Sophomore', 10], ['soph', 10], ['SO', 10], ['Junior', 11], ['jr', 11], ['Senior', 12], ['SR', 12], [' 10 ', 10],
  ])('parses %j as %i', (raw, n) => expect(parseGrade(raw)).toBe(n));

  it.each(['', '  ', '0', '13', 'grad', 'abc', '-1'])('returns null for %j', (raw) => expect(parseGrade(raw)).toBeNull());
});

describe('rowFromCells', () => {
  it('reads mapped cells and cleans them', () => {
    const map = autoMapColumns(['First', 'Last', '#', 'Pos', 'Grade', 'Parent email', 'Player email', 'Phone']);
    const r = rowFromCells([' Jayden ', 'Smith', '#12', 'qb', 'Senior', 'PAT.Smith@Example.com ', 'Jayden@Example.com', ' 555-0100 '], map);
    expect(r).toEqual({
      first_name: 'Jayden', last_name: 'Smith', jersey: '12', position: 'QB', grade: 12,
      guardian_email: 'pat.smith@example.com', athlete_email: 'jayden@example.com', guardian_phone: '555-0100',
    });
  });

  it('fills unmapped or missing cells with blanks', () => {
    const r = rowFromCells(['Liam'], { first_name: 0, last_name: 3 });
    expect(r).toEqual({ first_name: 'Liam', last_name: '', jersey: '', position: '', grade: null, guardian_email: '', athlete_email: '', guardian_phone: '' });
  });
});

describe('checkRows', () => {
  it('marks a complete row ready', () => {
    const [c] = checkRows([row()]);
    expect(c.level).toBe('ready');
    expect(c.issues).toEqual([]);
  });

  it('errors on missing names', () => {
    const [c] = checkRows([row({ first_name: '', last_name: '' })]);
    expect(c.level).toBe('error');
    expect(c.issues).toContain('First name is missing.');
    expect(c.issues).toContain('Last name is missing.');
  });

  it('errors on invalid emails', () => {
    const [g, a] = checkRows([row({ guardian_email: 'pat@' }), row({ jersey: '13', athlete_email: 'jayden at example.com' })]);
    expect(g.level).toBe('error');
    expect(g.issues).toContain('Guardian email is not valid.');
    expect(a.level).toBe('error');
    expect(a.issues).toContain('Athlete email is not valid.');
    expect(checkRows([row({ guardian_email: 'x@y.c' })])[0].issues).toContain('Guardian email is not valid.');
  });

  it('warns on duplicate numbers in the file', () => {
    const checks = checkRows([row(), row({ first_name: 'Liam', last_name: 'Johnson', guardian_email: 'l@example.com' })]);
    for (const c of checks) {
      expect(c.level).toBe('warning');
      expect(c.issues).toContain('Number 12 is used more than once.');
    }
  });

  it('warns when the number is already used on the roster', () => {
    const [c] = checkRows([row({ first_name: 'Liam' })], [{ first_name: 'Jayden', last_name: 'Smith', jersey: '12' }]);
    expect(c.level).toBe('warning');
    expect(c.issues).toContain('Number 12 is used more than once.');
  });

  it('errors when the same player is already on the roster, ignoring case', () => {
    const [c] = checkRows([row()], [{ first_name: 'JAYDEN', last_name: 'smith ', jersey: '12' }]);
    expect(c.level).toBe('error');
    expect(c.issues).toContain('Already on the roster.');
  });

  it('warns when an email is already on the roster', () => {
    const [c] = checkRows([row({ first_name: 'Liam', jersey: '22' })], [{ first_name: 'Jayden', last_name: 'Smith', jersey: '12', guardian_email: 'Pat.Smith@example.com' }]);
    expect(c.level).toBe('warning');
    expect(c.issues).toContain('An athlete with this email is already on the roster.');
  });

  it('warns on a bad number, a missing guardian email and a non-standard position', () => {
    const [c] = checkRows([row({ jersey: '100', guardian_email: '', position: 'GOALIE' })]);
    expect(c.level).toBe('warning');
    expect(c.issues).toEqual([
      'Number should be 0 to 99.',
      'No guardian email, so no invite can be sent.',
      'Position "GOALIE" isn\'t a standard abbreviation.',
    ]);
  });

  it('lists errors before warnings', () => {
    const [c] = checkRows([row({ first_name: '', guardian_email: '' })]);
    expect(c.level).toBe('error');
    expect(c.issues[0]).toBe('First name is missing.');
    expect(c.issues.at(-1)).toBe('No guardian email, so no invite can be sent.');
  });

  it('accepts blank optional fields other than the guardian email', () => {
    const [c] = checkRows([row({ jersey: '', position: '', grade: null })]);
    expect(c.level).toBe('ready');
  });
});
