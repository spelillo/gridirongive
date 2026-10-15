import 'server-only';
import { sys } from '@/lib/db';
import { ipKey } from '@/lib/request';
import { sha256 } from '@/lib/crypto';

/** Simple sliding-window limits stored in unlock_attempts (keys never hold raw IPs or emails). */
export async function authKeys(scope: 'magic' | 'verify', email: string) {
  return [await ipKey(scope), `${scope}:${sha256(email.trim().toLowerCase()).slice(0, 32)}`];
}

export async function countRecent(keys: string[], minutes: number, onlyFailures = false): Promise<number> {
  const row = await sys.one<{ n: number }>(
    `select count(*)::int as n from unlock_attempts where key = any($1::text[]) and created_at > now() - make_interval(mins => $2)
       and ($3::boolean = false or success = false)`,
    [keys, minutes, onlyFailures],
  );
  return row?.n ?? 0;
}

export async function record(keys: string[], success: boolean) {
  for (const k of keys) await sys.query(`insert into unlock_attempts (key, success) values ($1, $2)`, [k, success]);
}
