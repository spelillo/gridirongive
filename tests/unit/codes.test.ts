import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  generateCode,
  normalizeCode,
  isCodeShape,
  parseCodeEntry,
  lockedUntil,
  UNLOCK_MAX_FAILURES,
  UNLOCK_WINDOW_MS,
} from '@/lib/domain/codes';

describe('code alphabet', () => {
  it('has no look-alike characters', () => {
    for (const ch of '0O1IL') expect(CODE_ALPHABET).not.toContain(ch);
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length);
    expect(CODE_LENGTH).toBe(6);
  });
});

describe('generateCode', () => {
  it('makes 6 characters from the alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode((n) => randomBytes(n));
      expect(code).toHaveLength(CODE_LENGTH);
      expect(isCodeShape(code)).toBe(true);
    }
  });

  it('maps bytes onto the alphabet deterministically', () => {
    const code = generateCode((n) => Uint8Array.from({ length: n }, (_, i) => i));
    expect(code).toBe(CODE_ALPHABET.slice(0, 6));
  });

  it('rejects bytes above the unbiased limit and asks for more', () => {
    const limit = 256 - (256 % CODE_ALPHABET.length); // 248
    let calls = 0;
    const code = generateCode((n) => {
      calls++;
      // First batch is all rejected, second batch is usable.
      return calls === 1 ? new Uint8Array(n).fill(limit) : new Uint8Array(n).fill(CODE_ALPHABET.length + 2);
    });
    expect(calls).toBe(2);
    expect(code).toBe(CODE_ALPHABET[2].repeat(6));
  });
});

describe('normalizeCode', () => {
  it('uppercases and strips spaces and punctuation', () => {
    expect(normalizeCode(' kx7-p2q ')).toBe('KX7P2Q');
    expect(normalizeCode('kx7 p2q')).toBe('KX7P2Q');
    expect(normalizeCode('k.x.7')).toBe('KX7');
    expect(normalizeCode('')).toBe('');
  });
});

describe('isCodeShape', () => {
  it('requires exactly 6 characters from the alphabet', () => {
    expect(isCodeShape('KX7P2Q')).toBe(true);
    expect(isCodeShape('KX7P2')).toBe(false);
    expect(isCodeShape('KX7P2QQ')).toBe(false);
    expect(isCodeShape('KX0P2Q')).toBe(false); // zero is not in the alphabet
    expect(isCodeShape('kx7p2q')).toBe(false); // must be normalized first
  });
});

describe('parseCodeEntry', () => {
  it('accepts a typed code in any case or spacing', () => {
    expect(parseCodeEntry('kx7p2q')).toEqual({ kind: 'code', code: 'KX7P2Q' });
    expect(parseCodeEntry('  KX7 P2Q ')).toEqual({ kind: 'code', code: 'KX7P2Q' });
    expect(parseCodeEntry('kx7-p2q')).toEqual({ kind: 'code', code: 'KX7P2Q' });
  });

  it('accepts a pasted share link', () => {
    expect(parseCodeEntry('https://gridirongive.com/s/Tcentralhigkx7p2q')).toEqual({ kind: 'share', token: 'Tcentralhigkx7p2q' });
    expect(parseCodeEntry('http://localhost:3000/s/abc_DEF-123/')).toEqual({ kind: 'share', token: 'abc_DEF-123' });
    expect(parseCodeEntry('gridirongive.com/s/abcdef12')).toEqual({ kind: 'share', token: 'abcdef12' });
  });

  it('accepts a team link with a code', () => {
    expect(parseCodeEntry('https://gridirongive.com/t/central-high-football?code=kx7p2q')).toEqual({
      kind: 'team-link',
      teamSlug: 'central-high-football',
      code: 'KX7P2Q',
    });
    expect(parseCodeEntry('/t/central-high-football?code=KX7P2Q')).toMatchObject({ kind: 'team-link', code: 'KX7P2Q' });
  });

  it('rejects links without a usable code or token', () => {
    expect(parseCodeEntry('https://gridirongive.com/t/central-high-football')).toEqual({ kind: 'invalid' });
    expect(parseCodeEntry('https://gridirongive.com/t/central-high-football?code=0000')).toEqual({ kind: 'invalid' });
    expect(parseCodeEntry('https://gridirongive.com/s/abc')).toEqual({ kind: 'invalid' }); // token too short
    expect(parseCodeEntry('https://example.com/somewhere')).toEqual({ kind: 'invalid' });
    expect(parseCodeEntry('https://')).toEqual({ kind: 'invalid' });
  });

  it('rejects garbage', () => {
    for (const s of ['', '   ', 'hello', 'KX7P2', 'KX7P2QX', 'O0O0O0', '!!!!!!', '<script>']) {
      expect(parseCodeEntry(s)).toEqual({ kind: 'invalid' });
    }
  });
});

describe('lockedUntil', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const min = 60_000;

  it('uses 5 failures in 10 minutes', () => {
    expect(UNLOCK_MAX_FAILURES).toBe(5);
    expect(UNLOCK_WINDOW_MS).toBe(10 * min);
  });

  it('is not locked with fewer than 5 recent failures', () => {
    expect(lockedUntil([], now)).toBeNull();
    expect(lockedUntil([ago(1 * min), ago(2 * min), ago(3 * min), ago(4 * min)], now)).toBeNull();
  });

  it('locks for ten minutes from the newest failure', () => {
    const fails = [ago(1 * min), ago(2 * min), ago(3 * min), ago(4 * min), ago(5 * min)];
    expect(lockedUntil(fails, now)).toEqual(new Date(now.getTime() + 9 * min));
  });

  it('ignores failures older than the window', () => {
    const fails = [ago(1 * min), ago(2 * min), ago(3 * min), ago(4 * min), ago(11 * min)];
    expect(lockedUntil(fails, now)).toBeNull();
  });

  it('counts order-independently', () => {
    const fails = [ago(5 * min), ago(0), ago(3 * min), ago(4 * min), ago(2 * min)];
    expect(lockedUntil(fails, now)).toEqual(new Date(now.getTime() + 10 * min));
  });
});
