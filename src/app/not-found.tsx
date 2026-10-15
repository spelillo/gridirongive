import type { Metadata } from 'next';
import { PublicShell } from '@/components/public/PublicShell';
import { NotFoundContent } from '@/components/public/NotFoundContent';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false, follow: false } };

/** Unmatched URLs and notFound() outside the public pages render here, inside the root layout only. */
export default function NotFound() {
  return (
    <PublicShell>
      <NotFoundContent />
    </PublicShell>
  );
}
