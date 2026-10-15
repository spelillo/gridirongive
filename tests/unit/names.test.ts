import { describe, it, expect } from 'vitest';
import {
  athleteDisplayName,
  firstName,
  possessive,
  initials,
  slugify,
  athleteSlug,
  positionGroup,
  gradeLabel,
  defaultUnder13,
  POSITION_GROUPS,
  POSITION_NAMES,
} from '@/lib/domain/names';

const jayden = { first_name: 'Jayden', last_name: 'Smith' };

describe('athleteDisplayName', () => {
  it('shows the last initial by default', () => {
    expect(athleteDisplayName(jayden)).toBe('Jayden S.');
    expect(athleteDisplayName({ ...jayden, show_full_last_name: false })).toBe('Jayden S.');
    expect(athleteDisplayName({ first_name: 'Ana', last_name: 'de la Cruz' })).toBe('Ana D.');
  });
  it('shows the full last name only with opt-in', () => {
    expect(athleteDisplayName({ ...jayden, show_full_last_name: true })).toBe('Jayden Smith');
  });
  it('uses the preferred name, with an explicit argument taking priority', () => {
    expect(athleteDisplayName({ ...jayden, preferred_name: 'JJ' })).toBe('JJ S.');
    expect(athleteDisplayName({ ...jayden, preferred_name: 'JJ' }, 'Jay')).toBe('Jay S.');
    expect(athleteDisplayName({ ...jayden, preferred_name: 'JJ' }, null)).toBe('JJ S.');
  });
  it('falls back to the first name when the preferred name is blank', () => {
    expect(athleteDisplayName({ ...jayden, preferred_name: '   ' })).toBe('Jayden S.');
    expect(athleteDisplayName(jayden, '')).toBe('Jayden S.');
  });
  it('trims and handles a missing last name', () => {
    expect(athleteDisplayName({ first_name: ' Jayden ', last_name: ' smith ' })).toBe('Jayden S.');
    expect(athleteDisplayName({ first_name: 'Jayden', last_name: '' })).toBe('Jayden');
  });
});

describe('firstName', () => {
  it('prefers the preferred name', () => {
    expect(firstName(jayden)).toBe('Jayden');
    expect(firstName({ ...jayden, preferred_name: 'JJ' })).toBe('JJ');
    expect(firstName(jayden, 'Jay')).toBe('Jay');
    expect(firstName({ ...jayden, preferred_name: ' ' })).toBe('Jayden');
  });
});

describe('possessive', () => {
  it('adds an apostrophe s, or just an apostrophe after s', () => {
    expect(possessive('Jayden')).toBe("Jayden's");
    expect(possessive('Chris')).toBe("Chris'");
    expect(possessive('JAMES')).toBe("JAMES'");
  });
});

describe('initials', () => {
  it('takes up to two initials, uppercased', () => {
    expect(initials('Jayden Smith')).toBe('JS');
    expect(initials('jayden')).toBe('J');
    expect(initials('Mary Ann Lee')).toBe('MA');
    expect(initials('  pat   smith  ')).toBe('PS');
    expect(initials('')).toBe('');
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Central High Varsity Football')).toBe('central-high-varsity-football');
    expect(slugify('  --Hello,  World!--  ')).toBe('hello-world');
  });
  it('strips accents and spells out ampersands', () => {
    expect(slugify('José Peña')).toBe('jose-pena');
    expect(slugify('Track & Field')).toBe('track-and-field');
  });
  it('caps at 60 characters without a trailing hyphen', () => {
    const s = slugify('a'.repeat(59) + ' bcd');
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith('-')).toBe(false);
    expect(s).toBe('a'.repeat(59));
    expect(slugify('x'.repeat(100))).toHaveLength(60);
  });
  it('returns empty for symbols only', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('athleteSlug', () => {
  it('is first name, last initial and jersey', () => {
    expect(athleteSlug('Jayden', 'Smith', '12')).toBe('jayden-s-12');
    expect(athleteSlug('Jayden', 'Smith')).toBe('jayden-s');
    expect(athleteSlug('Jayden', 'Smith', null)).toBe('jayden-s');
    expect(athleteSlug('Jayden', '', '12')).toBe('jayden-12');
  });
  it('falls back to "player"', () => {
    expect(athleteSlug('', '', '')).toBe('player');
    expect(athleteSlug('!!', '?', null)).toBe('player');
  });
});

describe('positionGroup', () => {
  it('maps positions to offense, defense and special teams', () => {
    expect(positionGroup('QB')).toBe('offense');
    expect(positionGroup('lb')).toBe('defense');
    expect(positionGroup('K')).toBe('special');
    expect(positionGroup('LS')).toBe('special');
  });
  it('uses the first of several positions', () => {
    expect(positionGroup('WR/CB')).toBe('offense');
    expect(positionGroup('CB, WR')).toBe('defense');
    expect(positionGroup('S WR')).toBe('defense');
  });
  it('returns null for unknown or missing positions', () => {
    expect(positionGroup('Goalie')).toBeNull();
    expect(positionGroup('')).toBeNull();
    expect(positionGroup(null)).toBeNull();
    expect(positionGroup(undefined)).toBeNull();
  });
  it('has a name for every grouped position', () => {
    expect(Object.keys(POSITION_NAMES).sort()).toEqual(Object.keys(POSITION_GROUPS).sort());
  });
});

describe('gradeLabel', () => {
  it('names high school grades', () => {
    expect(gradeLabel(9)).toBe('Freshman');
    expect(gradeLabel(10)).toBe('Sophomore');
    expect(gradeLabel(11)).toBe('Junior');
    expect(gradeLabel(12)).toBe('Senior');
  });
  it('labels younger grades by number and blanks for none', () => {
    expect(gradeLabel(7)).toBe('Grade 7');
    expect(gradeLabel(null)).toBe('');
    expect(gradeLabel(undefined)).toBe('');
    expect(gradeLabel(0)).toBe('');
  });
});

describe('defaultUnder13', () => {
  it('treats grade 7 and below as under 13', () => {
    expect(defaultUnder13(7, 'varsity')).toBe(true);
    expect(defaultUnder13(6, 'youth')).toBe(true);
    expect(defaultUnder13(8, 'youth')).toBe(false);
    expect(defaultUnder13(12, 'varsity')).toBe(false);
  });
  it('falls back to the team level without a grade', () => {
    expect(defaultUnder13(null, 'youth')).toBe(true);
    expect(defaultUnder13(null, 'varsity')).toBe(false);
    expect(defaultUnder13(undefined, 'jv')).toBe(false);
  });
});
