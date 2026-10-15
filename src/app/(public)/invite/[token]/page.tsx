import type { Metadata } from 'next';
import Link from 'next/link';
import { UserRound, Users } from 'lucide-react';
import { lookupInvite, markInviteOpened } from '@/lib/invites';
import { getUser } from '@/lib/auth/session';
import { mode } from '@/lib/env';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { SignInForm } from '../../sign-in/SignInForm';
import { ResendRequest } from './ResendRequest';
import { cn } from '@/components/ui/cn';
import { possessive } from '@/lib/domain/names';

export const metadata: Metadata = { title: 'Invite', robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ as?: string; error?: string }> };

/** Invite acceptance (ui-ux-spec 7.1). */
export default async function InvitePage({ params, searchParams }: Props) {
  const { token } = await params;
  const { as: asParam, error } = await searchParams;
  const inv = await lookupInvite(token);
  const wrap = (children: React.ReactNode) => <div className="page-x mx-auto flex w-full max-w-[560px] flex-col gap-6 py-10 md:py-14">{children}</div>;

  if (!inv) {
    return wrap(
      <>
        <h1 className="t-section">This invite link isn&apos;t valid</h1>
        <p className="t-body">Check that the whole link was copied from the email. If it still doesn&apos;t work, ask your coach to send a new invite.</p>
        <p className="t-body">
          Already set up? <Link href="/sign-in">Sign in</Link>.
        </p>
      </>,
    );
  }
  if (inv.expired) {
    return wrap(
      <>
        <h1 className="t-section">This invite expired</h1>
        <p className="t-body">Invites work for 30 days. Ask {inv.coach} to resend it. We&apos;ll pass the message on without sharing your email.</p>
        <ResendRequest token={token} coach={inv.coach} />
      </>,
    );
  }
  await markInviteOpened(inv);
  const user = await getUser();
  const first = inv.athlete.first;
  const roles: ('guardian' | 'athlete')[] = inv.athlete.under13 ? ['guardian'] : ['guardian', 'athlete'];
  const chosen = asParam === 'athlete' && !inv.athlete.under13 ? 'athlete' : asParam === 'guardian' ? 'guardian' : null;

  return wrap(
    <>
      <div className="flex flex-col gap-2">
        <p className="t-caption">{inv.team.name}</p>
        <h1 className="t-section">
          {inv.coach} added {first} to {inv.team.name}
          {inv.team.season ? ` (${inv.team.season})` : ''}.
        </h1>
        <p className="t-body">Gridiron Give lets supporters fund {possessive(first)} gear. Nothing about {first} is shown until a parent or guardian gives consent.</p>
      </div>
      {error && <Banner tone="error">{error}</Banner>}

      <fieldset className="flex flex-col gap-3">
        <legend className="t-subhead mb-3">Who are you?</legend>
        {roles.map((r) => {
          const on = chosen === r;
          const Icon = r === 'guardian' ? Users : UserRound;
          return (
            <Link
              key={r}
              href={`/invite/${token}?as=${r}`}
              scroll={false}
              aria-current={on ? 'true' : undefined}
              className={cn(
                'flex min-h-16 items-center gap-4 rounded-md border px-4 py-3 no-underline',
                on ? 'border-primary bg-band-blue' : 'border-hairline-soft hover:border-hairline',
              )}
            >
              <Icon aria-hidden size={24} strokeWidth={1.75} className="text-primary" />
              <span className="text-[16px] font-medium text-ink">{r === 'guardian' ? `I'm ${possessive(first)} parent or guardian` : `I'm ${first}`}</span>
            </Link>
          );
        })}
        {inv.athlete.under13 && <p className="t-caption">Players under 13 have their page set up by a parent or guardian.</p>}
      </fieldset>

      {chosen &&
        (user ? (
          <form action="/api/invite/accept" method="post" className="flex flex-col gap-3 border-t border-hairline-soft pt-6">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="as" value={chosen} />
            <p className="t-body">
              You&apos;re signed in as <span className="font-medium text-ink">{user.email}</span>.
            </p>
            <Button type="submit">{chosen === 'guardian' ? 'Continue to consent' : 'Continue to my page'}</Button>
            <p className="t-caption">
              Not you?{' '}
              <button formAction="/auth/sign-out" className="text-primary underline">
                Sign out
              </button>
            </p>
          </form>
        ) : (
          <section aria-labelledby="signin-h" className="flex flex-col gap-4 border-t border-hairline-soft pt-6">
            <div className="flex flex-col gap-1">
              <h2 id="signin-h" className="t-subhead">
                Sign in to continue
              </h2>
              <p className="t-caption">We&apos;ll email a link and a 6-digit code. The code works on any device.</p>
            </div>
            <SignInForm next={`/invite/${token}?as=${chosen}`} initialEmail={chosen === inv.role ? inv.email : ''} demo={mode.demo} />
          </section>
        ))}
    </>,
  );
}
