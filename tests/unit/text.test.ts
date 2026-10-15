import { describe, it, expect } from 'vitest';
import { editDistance, isSmallTextFix, truncate, relativeTime, formatDate, pluralize, cleanUserText, needsHumanReview } from '@/lib/domain/text';

describe('editDistance', () => {
  it('computes Levenshtein distance', () => {
    expect(editDistance('', '')).toBe(0);
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('abc', '')).toBe(3);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('flaw', 'lawn')).toBe(2);
    expect(editDistance('Jayden', 'Jaden')).toBe(1);
  });
  it('stops early past the cap', () => {
    expect(editDistance('a'.repeat(100), 'b'.repeat(100), 10)).toBe(11);
    expect(editDistance('a', 'a'.repeat(200), 64)).toBe(65);
    expect(editDistance('abc', 'xyz', 2)).toBe(3);
  });
});

describe('isSmallTextFix', () => {
  const bio = "I've played quarterback since seventh grade. My helmet is a hand-me-down.";
  it('is false when nothing was published yet', () => {
    expect(isSmallTextFix(null, bio)).toBe(false);
    expect(isSmallTextFix(undefined, bio)).toBe(false);
    expect(isSmallTextFix('', bio)).toBe(false);
  });
  it('is true for typo fixes under 20 characters', () => {
    expect(isSmallTextFix(bio, bio.replace('seventh', 'sevnth'))).toBe(true);
    expect(isSmallTextFix(bio, bio)).toBe(true);
    expect(isSmallTextFix(bio, bio + ' Go team.')).toBe(true);
  });
  it('is false for 20 or more changed characters', () => {
    expect(isSmallTextFix(bio, bio + ' I also play safety.!')).toBe(false); // 21 added
    expect(isSmallTextFix(bio, 'Something completely different.')).toBe(false);
    expect(isSmallTextFix('a', 'a' + 'b'.repeat(20))).toBe(false);
    expect(isSmallTextFix('a', 'a' + 'b'.repeat(19))).toBe(true);
  });
});

describe('truncate', () => {
  it('cuts with an ellipsis only when needed', () => {
    expect(truncate('hello', 10)).toBe('hello');
    expect(truncate('hello', 5)).toBe('hello');
    expect(truncate('hello world', 7)).toBe('hello…');
    expect(truncate('hello world', 8)).toBe('hello w…');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const ago = (sec: number) => new Date(now.getTime() - sec * 1000);
  it('says "just now" under a minute either way', () => {
    expect(relativeTime(ago(0), now)).toBe('just now');
    expect(relativeTime(ago(59), now)).toBe('just now');
    expect(relativeTime(ago(-30), now)).toBe('just now');
  });
  it('uses minutes, hours and days', () => {
    expect(relativeTime(ago(5 * 60), now)).toBe('5 minutes ago');
    expect(relativeTime(ago(60), now)).toBe('1 minute ago');
    expect(relativeTime(ago(3 * 3600), now)).toBe('3 hours ago');
    expect(relativeTime(ago(86400), now)).toBe('yesterday');
    expect(relativeTime(ago(4 * 86400), now)).toBe('4 days ago');
    expect(relativeTime(ago(-2 * 3600), now)).toBe('in 2 hours');
  });
  it('accepts ISO strings', () => {
    expect(relativeTime(ago(10 * 60).toISOString(), now)).toBe('10 minutes ago');
  });
  it('falls back to a date after 30 days', () => {
    const d = ago(45 * 86400);
    expect(relativeTime(d, now)).toBe(formatDate(d));
    expect(formatDate(new Date(2026, 7, 30, 12))).toBe('Aug 30, 2026');
  });
});

describe('pluralize', () => {
  it('picks singular or plural and formats the number', () => {
    expect(pluralize(1, 'item')).toBe('1 item');
    expect(pluralize(0, 'item')).toBe('0 items');
    expect(pluralize(2, 'item')).toBe('2 items');
    expect(pluralize(1200, 'player')).toBe('1,200 players');
    expect(pluralize(3, 'family', 'families')).toBe('3 families');
    expect(pluralize(1, 'family', 'families')).toBe('1 family');
  });
});

describe('cleanUserText', () => {
  it('strips control characters and trims', () => {
    expect(cleanUserText('  Go\u0000 Bob\u0007cats\u001F!\u007F  ', 200)).toBe('Go Bobcats!');
    expect(cleanUserText('\u0008\u000B\u000C\u000E', 200)).toBe('');
  });
  it('keeps tabs and newlines and normalizes CRLF', () => {
    expect(cleanUserText('Line one\r\nLine\ttwo', 200)).toBe('Line one\nLine\ttwo');
  });
  it('caps the length after trimming', () => {
    expect(cleanUserText('   abcdef', 3)).toBe('abc');
    expect(cleanUserText('x'.repeat(500), 200)).toHaveLength(200);
  });
  it('leaves normal text, accents and emoji-free punctuation alone', () => {
    expect(cleanUserText("Proud of you, José. Play hard!", 200)).toBe("Proud of you, José. Play hard!");
  });
});

describe('needsHumanReview', () => {
  it.each([
    'Check out https://example.com',
    'visit www.example.com',
    'Send me money on Venmo',
    'cash app me',
    'CashApp $me',
    'zelle works',
    'my paypal',
    'call 865-555-0100',
    'call 865.555.0100',
    'call 8655550100',
    'email me at pat@example.com',
  ])('flags %j', (s) => expect(needsHumanReview(s)).toBe(true));

  it.each(['Go Bobcats!', 'Proud of you. Play hard and stay safe.', 'Have a great senior year #12', 'Score 21-14 next week'])(
    'passes %j',
    (s) => expect(needsHumanReview(s)).toBe(false),
  );
});
