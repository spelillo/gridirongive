import type { MetadataRoute } from 'next';
import { env, mode } from '@/lib/env';

/**
 * Crawlers may read the public marketing pages and team summary pages.
 * Everything private, transactional or token based is disallowed. Athlete
 * pages also send noindex, and are never linked from public pages.
 * A demo deployment (sample data) asks not to be indexed at all.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = ['/app', '/admin', '/api', '/auth', '/give', '/receipt', '/thanks', '/invite', '/s/', '/dev', '/demo', '/report', '/link-expired', '/media/athlete'];
  return {
    rules: mode.demo ? { userAgent: '*', disallow: '/' } : { userAgent: '*', allow: '/', disallow },
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
