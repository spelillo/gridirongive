import 'server-only';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { mode } from '@/lib/env';

/**
 * File storage. Every bucket is private: files are served through /media
 * routes that check access first (an athlete photo only reaches people who
 * have the team code, the athlete's link, or a role on the team).
 *
 * Live mode uses Supabase Storage with the service key. Demo mode writes to
 * .data/uploads on local disk.
 */
export type Bucket = 'photos' | 'receipts' | 'verification' | 'team';

export const BUCKETS: Bucket[] = ['photos', 'receipts', 'verification', 'team'];

export const UPLOAD_LIMITS: Record<Bucket, { maxBytes: number; types: string[] }> = {
  photos: { maxBytes: 4 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp'] },
  team: { maxBytes: 4 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp'] },
  receipts: { maxBytes: 4 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
  verification: { maxBytes: 4 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
};

function localRoot() {
  return process.env.VERCEL ? '/tmp/gridiron-give-uploads' : path.join(process.cwd(), '.data', 'uploads');
}

function localPath(bucket: Bucket, key: string) {
  if (key.includes('..') || key.startsWith('/')) throw new Error('Bad storage key');
  return path.join(localRoot(), bucket, key);
}

/** Checks magic bytes so a renamed file can't pass as an image. */
export function sniffType(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  if (b[0] === 0x3c) {
    const head = new TextDecoder().decode(b.slice(0, 200));
    if (head.includes('<svg')) return 'image/svg+xml';
  }
  return null;
}

export async function putObject(bucket: Bucket, key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  if (mode.demo) {
    const p = localPath(bucket, key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, bytes);
    await writeFile(`${p}.type`, contentType);
    return;
  }
  const { supabaseService } = await import('@/lib/auth/supabase');
  const { error } = await supabaseService().storage.from(bucket).upload(key, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

export async function getObject(bucket: Bucket, key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (mode.demo) {
    // Seeded demo images ship in /public/demo and are referenced as "demo/...".
    if (key.startsWith('demo/')) {
      try {
        const p = path.join(process.cwd(), 'public', key);
        return { bytes: await readFile(p), contentType: key.endsWith('.svg') ? 'image/svg+xml' : 'image/webp' };
      } catch {
        return null;
      }
    }
    try {
      const p = localPath(bucket, key);
      const [bytes, type] = await Promise.all([readFile(p), readFile(`${p}.type`, 'utf8').catch(() => 'application/octet-stream')]);
      return { bytes, contentType: type };
    } catch {
      return null;
    }
  }
  if (key.startsWith('demo/')) {
    try {
      const p = path.join(process.cwd(), 'public', key);
      return { bytes: await readFile(p), contentType: key.endsWith('.svg') ? 'image/svg+xml' : 'image/webp' };
    } catch {
      return null;
    }
  }
  const { supabaseService } = await import('@/lib/auth/supabase');
  const { data, error } = await supabaseService().storage.from(bucket).download(key);
  if (error || !data) return null;
  return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || 'application/octet-stream' };
}

export async function removeObject(bucket: Bucket, key: string): Promise<void> {
  if (key.startsWith('demo/')) return;
  if (mode.demo) {
    await rm(localPath(bucket, key), { force: true });
    await rm(`${localPath(bucket, key)}.type`, { force: true });
    return;
  }
  const { supabaseService } = await import('@/lib/auth/supabase');
  await supabaseService().storage.from(bucket).remove([key]);
}
