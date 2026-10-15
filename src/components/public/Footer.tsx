import Link from 'next/link';
import { mode } from '@/lib/env';
import { Logo } from '@/components/ui/Logo';

const cols = [
  { title: 'Give', links: [{ href: '/search', label: 'Find a team' }, { href: '/#how-it-works', label: 'How it works' }, { href: '/for-teams#fees', label: 'Fees' }] },
  { title: 'Coaches', links: [{ href: '/for-teams', label: 'For coaches' }, { href: '/sign-in', label: 'Sign in' }, { href: '/app/manager/new', label: 'Start a team' }] },
  { title: 'Support', links: [{ href: '/help', label: 'Help' }, { href: '/help#contact', label: 'Contact' }, { href: '/report', label: 'Report a concern' }] },
  { title: 'Legal', links: [{ href: '/terms', label: 'Terms' }, { href: '/privacy', label: 'Privacy' }, { href: '/guardian-consent', label: 'Guardian consent policy' }] },
];

export function Footer() {
  // The demo guide only exists in demo mode.
  const columns = mode.demo ? cols.map((c) => (c.title === 'Support' ? { ...c, links: [...c.links, { href: '/demo', label: 'Demo guide' }] } : c)) : cols;
  return (
    <footer className="no-print mt-auto bg-night text-white">
      <div className="page-x mx-auto grid max-w-[1280px] gap-10 py-12 md:grid-cols-[1.2fr_2fr] md:py-16">
        <div className="flex flex-col gap-4">
          <Logo tone="light" />
          <p className="max-w-xs text-[14px] leading-[22px] text-[#b6c0d4]">
            Donors fund specific gear for specific players. Coaches buy it and post the receipt.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {columns.map((c) => (
            <div key={c.title}>
              <h2 className="mb-3 text-[13px] font-semibold tracking-[0.06em] text-white uppercase">{c.title}</h2>
              <ul className="flex flex-col gap-0.5">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="inline-flex min-h-9 items-center text-[14.5px] text-[#c7cfdf] no-underline hover:text-white hover:underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="page-x mx-auto max-w-[1280px] py-5 text-[13px] text-[#9aa6bd]">© {new Date().getFullYear()} Gridiron Give. Payments by Stripe.</p>
      </div>
    </footer>
  );
}
