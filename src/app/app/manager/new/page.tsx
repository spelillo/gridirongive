import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, Check, X, Clock } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { asUser, sys } from '@/lib/db';
import { env, mode } from '@/lib/env';
import { Stepper } from '@/components/ui/Stepper';
import { Banner } from '@/components/ui/Banner';
import { ButtonLink, buttonClass } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { AccountStep, TeamStep, VerifyStep, TemplateStep, PublishButton } from './WizardSteps';
import { TeamPhoto } from '../[teamId]/settings/SettingsForms';

const STEPS = ['Your account', 'Team', 'Verify', 'Payouts', 'Roster and gear'];

type Props = { searchParams: Promise<{ team?: string; step?: string; title?: string; fresh?: string; stripe?: string }> };

interface Draft {
  id: string;
  name: string;
  slug: string;
  sport: string;
  level: string;
  about: string;
  status: string;
  verification_status: string;
  verification_method: string | null;
  verification_contact: string | null;
  payouts_status: string;
  stripe_account_id: string | null;
  default_template_id: string | null;
  photo_path: string | null;
  org_name: string;
  org_domain: string | null;
  city: string;
  state: string;
  season_label: string;
  starts_on: string | null;
  ends_on: string | null;
  title: string | null;
  coach: boolean;
  edit: boolean;
  athletes: number;
}

function nextStep(t: Draft): string {
  if (t.verification_status === 'unverified' || t.verification_status === 'rejected') return '3';
  if (t.payouts_status !== 'connected') return '4';
  if (!t.default_template_id) return '5';
  return 'review';
}

/** Team setup wizard (ui-ux-spec 8.1). Resumable: progress lives on the draft team. */
export default async function NewTeamPage({ searchParams }: Props) {
  const sp = await searchParams;
  const user = await requireUser('/app/manager/new');
  const profile = await sys.one<{ full_name: string | null; phone: string | null }>(`select full_name, phone from profiles where id = $1`, [user.id]);
  const teamId = sp.team && /^[0-9a-f-]{36}$/.test(sp.team) ? sp.team : null;

  if (!teamId) {
    const drafts = await sys.query<{ id: string; name: string; verification_status: string; payouts_status: string; default_template_id: string | null }>(
      `select t.id, t.name, t.verification_status, t.payouts_status, t.default_template_id from teams t join team_members m on m.team_id = t.id
       where m.user_id = $1 and m.status = 'active' and m.role in ('coach', 'staff') and t.status = 'draft' order by t.created_at desc`,
      [user.id],
    );
    if (drafts.length === 1 && !sp.fresh && !sp.step) {
      redirect(`/app/manager/new?team=${drafts[0].id}&step=${nextStep(drafts[0] as unknown as Draft)}`);
    }
    if (drafts.length > 1 && !sp.fresh && !sp.step) {
      return (
        <div className="mx-auto flex max-w-[720px] flex-col gap-6">
          <h1 className="t-hero">Finish setting up</h1>
          <ul className="divide-y divide-hairline-soft rounded-md border border-hairline-soft">
            {drafts.map((d) => (
              <li key={d.id}>
                <Link href={`/app/manager/new?team=${d.id}&step=${nextStep(d as unknown as Draft)}`} className="flex min-h-16 items-center gap-4 px-4 py-3 no-underline hover:bg-chrome">
                  <span className="flex-1 font-medium text-ink">{d.name}</span>
                  <Chip tone="warn">Setup</Chip>
                  <ChevronRight size={20} aria-hidden className="text-ink-meta" />
                </Link>
              </li>
            ))}
          </ul>
          <ButtonLink href="/app/manager/new?fresh=1&step=1" variant="secondary">
            Set up a different team
          </ButtonLink>
        </div>
      );
    }
    const step = sp.step === '2' ? 2 : 1;
    const sports = (await sys.query<{ sport: string }>(`select distinct sport from gear_catalog where active order by sport`)).map((s) => s.sport);
    return (
      <Shell step={step - 1} teamId={null}>
        {step === 1 ? (
          <AccountStep fullName={profile?.full_name ?? ''} phone={profile?.phone ?? ''} title={sp.title ?? 'Head coach'} teamId={null} />
        ) : (
          <TeamStep teamId={null} sports={sports} title={sp.title ?? 'Head coach'} appHost={env.appUrl.replace(/^https?:\/\//, '')} initial={null} />
        )}
      </Shell>
    );
  }

  const t = await asUser(user.id, (tx) =>
    tx.one<Draft>(
      `select t.id, t.name, t.slug, t.sport, t.level, t.about, t.status, t.verification_status, t.verification_method, t.verification_contact,
         t.payouts_status, t.stripe_account_id, t.default_template_id, t.photo_path, o.name as org_name, o.domain as org_domain, t.city, t.state,
         coalesce(s.label, '') as season_label, s.starts_on::text, s.ends_on::text,
         (select title from team_members m where m.team_id = t.id and m.user_id = $2 and m.status = 'active') as title,
         is_team_coach(t.id) as coach, can_edit_team(t.id) as edit,
         (select count(*) from athletes a where a.team_id = t.id and a.archived_at is null)::int as athletes
       from teams t join organizations o on o.id = t.org_id left join seasons s on s.id = t.current_season_id where t.id = $1`,
      [teamId, user.id],
    ),
  ).catch(() => null);
  if (!t || !t.edit) redirect('/app/manager/new?fresh=1');
  if (t.status !== 'draft' && sp.step !== 'review') redirect(`/app/manager/${t.id}`);

  const stepParam = sp.step ?? nextStep(t);
  const review = stepParam === 'review';
  const step = review ? 5 : Math.min(Math.max(Number(stepParam) || 3, 1), 5);
  const verified = t.verification_status === 'verified';
  const connected = t.payouts_status === 'connected';

  if (review) {
    const items = [
      { label: 'Your account', done: Boolean(profile?.full_name), reason: 'Add your name.', href: `?team=${t.id}&step=1` },
      { label: 'Team details', done: true, reason: '', href: `?team=${t.id}&step=2` },
      {
        label: 'Verified',
        done: verified,
        reason: t.verification_status === 'under_review' ? 'Under review. Most teams are verified within 1 business day.' : 'Send a document or an athletic director contact.',
        href: `?team=${t.id}&step=3`,
        pending: t.verification_status === 'under_review',
      },
      { label: 'Payouts connected', done: connected, reason: t.payouts_status === 'pending' ? 'Stripe needs more info.' : t.payouts_status === 'restricted' ? 'Stripe restricted the account.' : 'Connect a Stripe account.', href: `?team=${t.id}&step=4` },
      { label: 'Gear kit chosen', done: Boolean(t.default_template_id), reason: 'Optional. Pick a default kit.', href: `?team=${t.id}&step=5`, optional: true },
      { label: 'Players added', done: t.athletes > 0, reason: 'Optional. You can add players after publishing.', href: `/app/manager/${t.id}/roster/import`, optional: true },
    ];
    return (
      <div className="mx-auto flex max-w-[720px] flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="t-hero">Review and publish</h1>
          <p className="t-body">{t.name}</p>
        </div>
        <ul className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft">
          {items.map((i) => (
            <li key={i.label} className="flex items-start gap-3 p-4">
              <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md ${i.done ? 'bg-funded-bg text-funded' : i.pending ? 'bg-warn-bg text-warn' : i.optional ? 'bg-chrome text-ink-meta' : 'bg-error-bg text-error'}`}>
                {i.done ? <Check size={16} aria-hidden /> : i.pending ? <Clock size={16} aria-hidden /> : <X size={16} aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">
                  {i.label}
                  <span className="sr-only">{i.done ? ': done' : ': not done'}</span>
                </p>
                {!i.done && <p className="t-caption">{i.reason}</p>}
              </div>
              {!i.done && (
                <Link href={i.href.startsWith('?') ? `/app/manager/new${i.href}` : i.href} className="t-caption shrink-0">
                  Fix<span className="sr-only"> {i.label}</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
        {t.status === 'live' ? (
          <Banner tone="success" action={<ButtonLink href={`/app/manager/${t.id}`}>Go to the team</ButtonLink>}>
            This team is live.
          </Banner>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <PublishButton teamId={t.id} disabled={!verified || !connected} />
            {(!verified || !connected) && (
              <p className="t-caption" id="publish-reason">
                Publishing needs {[!verified && 'verification', !connected && 'connected payouts'].filter(Boolean).join(' and ')}. You can keep building in the meantime.
              </p>
            )}
          </div>
        )}
        <ButtonLink href={`/app/manager/${t.id}`} variant="tertiary">
          Go to the team dashboard
        </ButtonLink>
      </div>
    );
  }

  const sports = (await sys.query<{ sport: string }>(`select distinct sport from gear_catalog where active order by sport`)).map((s) => s.sport);
  let body: React.ReactNode = null;
  if (step === 1) {
    body = <AccountStep fullName={profile?.full_name ?? ''} phone={profile?.phone ?? ''} title={t.title ?? 'Head coach'} teamId={t.id} />;
  } else if (step === 2) {
    body = (
      <div className="flex flex-col gap-6">
        <TeamStep
          teamId={t.id}
          sports={sports}
          title={t.title ?? 'Head coach'}
          appHost={env.appUrl.replace(/^https?:\/\//, '')}
          initial={{ orgName: `${t.org_name}, ${t.city}, ${t.state}`, sport: t.sport, level: t.level, name: t.name, slug: t.slug, seasonLabel: t.season_label, startsOn: t.starts_on ?? '', endsOn: t.ends_on ?? '', about: t.about }}
        />
        <section aria-labelledby="photo-h" className="flex flex-col gap-3 border-t border-hairline-soft pt-6">
          <h2 id="photo-h" className="t-subhead">
            Team photo <span className="t-caption font-normal">Optional</span>
          </h2>
          <TeamPhoto teamId={t.id} hasPhoto={Boolean(t.photo_path)} canEdit />
        </section>
      </div>
    );
  } else if (step === 3) {
    const domain = user.email.split('@')[1]?.toLowerCase() ?? '';
    body = (
      <VerifyStep
        teamId={t.id}
        status={t.verification_status}
        method={t.verification_method}
        contact={t.verification_contact}
        orgDomain={t.org_domain}
        emailDomain={domain}
      />
    );
  } else if (step === 4) {
    body = (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="t-section">Payouts</h2>
          <p className="t-body">Gifts settle into a Stripe account that belongs to the school, booster club or coach. Stripe checks identity and tax details. Gridiron Give never stores bank details.</p>
        </div>
        {sp.stripe === 'error' && <Banner tone="error">We couldn&apos;t open Stripe. Try again in a minute.</Banner>}
        {!t.coach ? (
          <Banner tone="info">Only the head coach can connect payouts.</Banner>
        ) : connected ? (
          <Banner tone="success">Payouts connected{mode.payments === 'simulated' ? ' (demo account)' : ''}.</Banner>
        ) : (
          <>
            {t.payouts_status === 'pending' && <Banner tone="warn">Stripe needs more info. Continue where you left off.</Banner>}
            {t.payouts_status === 'restricted' && <Banner tone="error">Stripe restricted the account. Open Stripe to fix it.</Banner>}
            <form method="post" action={`/api/teams/${t.id}/stripe/connect?from=wizard`}>
              <button type="submit" className={buttonClass('primary', { fullMobile: true })}>
                {t.stripe_account_id ? 'Continue with Stripe' : 'Connect with Stripe'}
              </button>
            </form>
            {mode.payments === 'simulated' && <p className="t-caption">Demo mode: this opens a pretend Stripe page. No bank details are collected.</p>}
          </>
        )}
        <WizardNav back={`/app/manager/new?team=${t.id}&step=3`} next={`/app/manager/new?team=${t.id}&step=5`} nextLabel={connected ? 'Continue' : 'Skip for now'} />
      </div>
    );
  } else {
    const templates = await asUser(user.id, (tx) =>
      tx.query<{ id: string; name: string; team_id: string | null; items: number; total: number; positions: string[] }>(
        `select g.id, g.name, g.team_id, g.positions, count(i.id)::int as items, coalesce(sum(i.price_cents), 0)::int as total
         from gear_templates g left join gear_template_items i on i.template_id = g.id
         where g.sport = $1 and (g.team_id is null or g.team_id = $2) group by g.id order by g.team_id nulls first, g.name`,
        [t.sport, t.id],
      ),
    );
    const current = templates.find((x) => x.id === t.default_template_id) ?? null;
    body = (
      <div className="flex flex-col gap-6">
        <TemplateStep
          teamId={t.id}
          current={current ? { id: current.id, name: current.name } : null}
          options={templates.filter((x) => !x.team_id).map((x) => ({ id: x.id, name: x.name, items: x.items, total: x.total, positions: x.positions, mine: templates.some((m) => m.team_id && m.name === x.name && m.id === t.default_template_id) }))}
        />
        <section aria-labelledby="roster-h" className="flex flex-col gap-3 border-t border-hairline-soft pt-6">
          <h2 id="roster-h" className="t-subhead">
            Players
          </h2>
          <p className="t-body">
            {t.athletes ? `${t.athletes} ${t.athletes === 1 ? 'player' : 'players'} on the roster.` : 'No players yet.'} Import a spreadsheet or paste a list. Invites go out when you&apos;re ready.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={`/app/manager/${t.id}/roster/import`} variant="secondary">
              Import roster
            </ButtonLink>
            <ButtonLink href={`/app/manager/${t.id}/templates`} variant="secondary">
              Edit gear templates
            </ButtonLink>
          </div>
        </section>
        <WizardNav back={`/app/manager/new?team=${t.id}&step=4`} next={`/app/manager/new?team=${t.id}&step=review`} nextLabel="Review and publish" />
      </div>
    );
  }

  return (
    <Shell step={step - 1} teamId={t.id} teamName={t.name} done={[Boolean(profile?.full_name), true, verified || t.verification_status === 'under_review', connected, Boolean(t.default_template_id)]}>
      {body}
    </Shell>
  );
}

function Shell({ step, teamId, teamName, done, children }: { step: number; teamId: string | null; teamName?: string; done?: boolean[]; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="t-hero">Set up your team</h1>
        <p className="t-caption">{teamName ? `${teamName}. Your progress is saved, so you can come back any time.` : 'About 10 minutes. You can stop and come back.'}</p>
      </div>
      <Stepper
        steps={STEPS.map((label, i) => ({ label, done: done?.[i] ?? false }))}
        current={step}
        hrefFor={(i) => (teamId ? `/app/manager/new?team=${teamId}&step=${i + 1}` : undefined)}
      />
      {children}
    </div>
  );
}

function WizardNav({ back, next, nextLabel }: { back: string; next: string; nextLabel: string }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-hairline-soft pt-5 sm:flex-row sm:justify-between">
      <ButtonLink href={back} variant="secondary">
        Back
      </ButtonLink>
      <ButtonLink href={next}>{nextLabel}</ButtonLink>
    </div>
  );
}
