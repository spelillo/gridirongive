import 'server-only';
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { env } from '@/lib/env';
import { generateCode } from '@/lib/domain/codes';

export function hmac(purpose: string, value: string): string {
  return createHmac('sha256', env.appSecret).update(`${purpose}:${value}`).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const URL_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Random URL-safe token without look-alike characters. */
export function randomToken(length = 22): string {
  const out: string[] = [];
  const limit = 256 - (256 % URL_ALPHABET.length);
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < limit && out.length < length) out.push(URL_ALPHABET[b % URL_ALPHABET.length]);
    }
  }
  return out.join('');
}

export function newTeamCode(): string {
  return generateCode((n) => randomBytes(n));
}

/** Team codes are looked up by keyed hash, so a database leak doesn't reveal them. */
export function codeHash(code: string): string {
  return hmac('team-code', code);
}

/** Signed value: "payload.signature". */
export function sign(purpose: string, payload: string): string {
  return `${payload}.${hmac(purpose, payload)}`;
}

export function verifySigned(purpose: string, signed: string | undefined | null): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf('.');
  if (i <= 0) return null;
  const payload = signed.slice(0, i);
  return safeEqual(signed.slice(i + 1), hmac(purpose, payload)) ? payload : null;
}

/** Signature for receipt links that work without signing in. */
export function receiptSig(donationId: string): string {
  return hmac('receipt', donationId).slice(0, 24);
}

export function sixDigitCode(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');
}
