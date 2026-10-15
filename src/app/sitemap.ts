import type { MetadataRoute } from 'next';
import { sys } from '@/lib/db';
import { env } from '@/lib/env';

// Built per request so it never queries the database during `next build`.
export const dynamic = 'force-dynamic';

/**
 * Public marketing pages and live team summary pages only. Athlete pages,
 * search results and anything behind a code, token or sign-in stay out
 * (ui-ux-spec 4.3).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.appUrl;
  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/for-teams`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/help`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/guardian-consent`, changeFrequency: 'yearly', priority: 0.2 },
  ];
  let teams: { slug: string; last_activity_at: Date }[] = [];
  try {
    teams = await sys.query<{ slug: string; last_activity_at: Date }>(
      `select slug, last_activity_at from teams where status in ('live', 'season_closed') order by last_activity_at desc limit 5000`,
    );
  } catch (e) {
    console.error('sitemap: team list failed', e);
  }
  return [
    ...pages,
    ...teams.map((t) => ({ url: `${base}/t/${t.slug}`, lastModified: new Date(t.last_activity_at), changeFrequency: 'daily' as const, priority: 0.7 })),
  ];
}
