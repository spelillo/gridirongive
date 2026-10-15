import type { Metadata } from 'next';
import { NotFoundContent } from '@/components/public/NotFoundContent';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false, follow: false } };

/** Inside the public layout, so the nav and footer are already there. */
export default function PublicNotFound() {
  return <NotFoundContent />;
}
