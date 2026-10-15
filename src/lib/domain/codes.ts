/**
 * Team codes and share links.
 *
 * Codes are 6 characters from an alphabet without look-alikes (no 0/O, 1/I/L),
 * so they survive being read aloud at practice or copied off a poster.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

export function generateCode(random: (n: number) => Uint8Array): string {
  // Rejection sampling keeps every character equally likely.
  const out: string[] = [];
  const limit = 256 - (256 % CODE_ALPHABET.length);
  while (out.length < CODE_LENGTH) {
    for (const b of random(16)) {
      if (b < limit && out.length < CODE_LENGTH) out.push(CODE_ALPHABET[b % CODE_ALPHABET.length]);
    }
  }
  return out.join('');
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isCodeShape(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}

export type CodeEntry =
  | { kind: 'code'; code: string }
  | { kind: 'share'; token: string }
  | { kind: 'team-link'; teamSlug: string; code: string }
  | { kind: 'invalid' };

/**
 * The code field also accepts a pasted share link
 * (https://.../s/TOKEN or https://.../t/slug?code=ABC123).
 */
export function parseCodeEntry(raw: string): CodeEntry {
  const input = raw.trim();
  if (!input) return { kind: 'invalid' };
  if (/^https?:\/\//i.test(input) || input.includes('/s/') || input.includes('/t/')) {
    try {
      const url = new URL(/^https?:\/\//i.test(input) ? input : `https://x.invalid/${input.replace(/^\/+/, '')}`);
      const share = url.pathname.match(/\/s\/([A-Za-z0-9_-]{6,64})\/?$/);
      if (share) return { kind: 'share', token: share[1] };
      const team = url.pathname.match(/\/t\/([a-z0-9-]+)/);
      const code = url.searchParams.get('code');
      if (team && code) {
        const c = normalizeCode(code);
        if (isCodeShape(c)) return { kind: 'team-link', teamSlug: team[1], code: c };
      }
    } catch {
      /* fall through */
    }
    return { kind: 'invalid' };
  }
  const code = normalizeCode(input);
  return isCodeShape(code) ? { kind: 'code', code } : { kind: 'invalid' };
}

export const UNLOCK_MAX_FAILURES = 5;
export const UNLOCK_WINDOW_MS = 10 * 60 * 1000;

/**
 * Given recent failed attempt times (newest first), returns when the lock
 * ends, or null if not locked. Five failures inside ten minutes lock the
 * field for ten minutes from the fifth failure.
 */
export function lockedUntil(failureTimes: Date[], now: Date): Date | null {
  const recent = failureTimes.filter((t) => now.getTime() - t.getTime() < UNLOCK_WINDOW_MS);
  if (recent.length < UNLOCK_MAX_FAILURES) return null;
  const newest = Math.max(...recent.map((t) => t.getTime()));
  const until = new Date(newest + UNLOCK_WINDOW_MS);
  return until > now ? until : null;
}
