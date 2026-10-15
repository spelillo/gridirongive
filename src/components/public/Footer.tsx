import Link from 'next/link';
import { mode } from '@/lib/env';

const cols = [
  { title: 'Product', links: [{ href: '/search', label: 'Find a team' }, { href: '/#how-it-works', label: 'How it works' }, { href: '/for-teams', label: 'For teams' }, { href: '/for-teams#fees', label: 'Fees' }] },
  { title: 'Support', links: [{ href: '/help', label: 'Help' }, { href: '/help#contact', label: 'Contact' }, { href: '/report', label: 'Report a concern' }] },
  { title: 'Legal', links: [{ href: '/terms', label: 'Terms' }, { href: '/privacy', label: 'Privacy' }, { href: '/guardian-consent', label: 'Guardian consent policy' }] },
];

export function Footer() {
  // The demo guide only exists in demo mode.
  const columns = mode.demo ? cols.map((c) => (c.title === 'Support' ? { ...c, links: [...c.links, { href: '/demo', label: 'Demo guide' }] } : c)) : cols;
  return (
    <footer className="no-print mt-auto bg-band">
      <div className="page-x mx-auto grid max-w-[1200px] grid-cols-2 gap-8 py-10 md:grid-cols-4">
        {columns.map((c) => (
          <div key={c.title}>
            <h2 className="t-label mb-3">{c.title}</h2>
            <ul className="flex flex-col gap-1">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="t-nav inline-flex min-h-9 items-center no-underline hover:text-primary hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="t-caption col-span-2 self-end md:col-span-1 md:text-right">© {new Date().getFullYear()} Gridiron Give. Payments by Stripe.</p>
      </div>
    </footer>
  );
}
