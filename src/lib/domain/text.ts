/** Levenshtein distance, capped for speed. */
export function editDistance(a: string, b: string, cap = 64): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * "Small text fixes skip the coach" (rebuild-architecture 6.8). A fix is
 * small when the bio already went through approval and fewer than 20
 * characters changed.
 */
export function isSmallTextFix(published: string | null | undefined, next: string): boolean {
  if (!published) return false;
  return editDistance(published, next, 20) < 20;
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function relativeTime(date: Date | string, now = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const sec = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(sec);
  if (abs < 60) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(sec / 86400), 'day');
  return formatDate(d);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/** Strips anything that would let a message carry markup or links into an email. */
export function cleanUserText(s: string, max: number): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

/**
 * A light first pass on donor messages and bios. Anything caught here waits
 * for a person to review it even on teams that skip message approval.
 */
const FLAGGED = [/https?:\/\//i, /www\./i, /\b(venmo|cashapp|cash app|zelle|paypal)\b/i, /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, /@[a-z0-9-]+\.[a-z]{2,}/i];
export function needsHumanReview(s: string): boolean {
  return FLAGGED.some((r) => r.test(s));
}
