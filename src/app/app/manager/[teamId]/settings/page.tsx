import Link from 'next/link';
import { loadTeamCtx } from '@/lib/app/team';
import { asUser } from '@/lib/db';
import { fundsHeld } from '@/lib/app/team-money';
import { money } from '@/lib/domain/money';
import { PageHeader, Section } from '@/components/ui/PageHeader';
import { Banner } from '@/components/ui/Banner';
import { ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ChangeCode } from '../share/ChangeCode';
import { ProfileForm, PrivacyToggles, StaffInvite, RemoveStaff, NextSeason, DeleteTeam, TeamPhoto } from './SettingsForms';

export const metadata = { title: 'Settings' };

const ROLE: Record<string, string> = { coach: 'Head coach', staff: 'Staff', viewer: 'Viewer' };

/** Team settings (ui-ux-spec 8.12). */
export default async function SettingsPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const ctx = await loadTeamCtx(teamId);
  const t = ctx.team;
  const data = await asUser(ctx.user.id, async (tx) => {
    const members = await tx.query<any>(
      `select m.id, m.email, m.role, m.title, m.status, m.user_id, p.full_name from team_members m left join profiles p on p.id = m.user_id
       where m.team_id = $1 and m.status <> 'removed' order by case m.role when 'coach' then 0 when 'staff' then 1 else 2 end, m.created_at`,
      [teamId],
    );
    const held = await fundsHeld(tx, teamId);
    const season = t.seasonId ? await tx.one<any>(`select label, starts_on, ends_on, status from seasons where id = $1`, [t.seasonId]) : null;
    return { members, held, season };
  });
  const editable = ctx.canEdit;

  return (
    <div className="flex max-w-[880px] flex-col gap-10">
      <PageHeader title="Settings" sub={t.name} />
      {!editable && <Banner tone="info">You have view access. Coaches and staff change settings.</Banner>}

      <Section title="Team profile" id="profile">
        <TeamPhoto teamId={teamId} hasPhoto={Boolean(t.photoPath)} canEdit={editable} />
        <ProfileForm teamId={teamId} name={t.name} about={t.about} seasonLabel={t.seasonLabel} canEdit={editable} />
      </Section>

      <Section title="Privacy" id="privacy">
        <PrivacyToggles
          teamId={teamId}
          canEdit={editable}
          values={{
            require_profile_approval: t.requireProfileApproval,
            require_thankyou_approval: t.requireThankyouApproval,
            require_message_approval: t.requireMessageApproval,
            show_amounts_to_athletes: t.showAmountsToAthletes,
          }}
        />
        {editable && (
          <div className="flex flex-col gap-3 rounded-md border border-hairline-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-ink">Team code</p>
              <p className="t-caption">
                Change it if it was posted publicly. See it in the <Link href={`/app/manager/${teamId}/share`}>share kit</Link>.
              </p>
            </div>
            <ChangeCode teamId={teamId} />
          </div>
        )}
      </Section>

      <Section title="Staff" id="staff">
        <p className="t-caption">Staff can do everything except payouts and deleting the team. Viewers can look but not change anything.</p>
        <ul className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft">
          {data.members.map((m: any) => (
            <li key={m.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-ink">
                  {m.full_name ?? m.email}
                  {m.user_id === ctx.user.id && <span className="font-normal text-ink-meta"> (you)</span>}
                </p>
                <p className="t-caption break-all">
                  {[m.title, m.full_name ? m.email : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Chip tone={m.role === 'coach' ? 'info' : 'neutral'}>{ROLE[m.role] ?? m.role}</Chip>
                {m.status === 'invited' && <Chip tone="warn" icon="clock">Invited</Chip>}
                {ctx.isCoach && m.role !== 'coach' && <RemoveStaff teamId={teamId} memberId={m.id} label={m.full_name ?? m.email} />}
              </div>
            </li>
          ))}
        </ul>
        {ctx.isCoach ? <StaffInvite teamId={teamId} /> : <p className="t-caption">Only the head coach can invite or remove staff.</p>}
      </Section>

      <Section title="Season" id="season">
        <div className="flex flex-col gap-1">
          <p className="t-body">
            {t.seasonLabel || 'No season'}
            {data.season && (
              <>
                {' '}
                <Chip tone={data.season.status === 'closed' ? 'muted' : 'funded'}>{data.season.status === 'closed' ? 'Closed' : 'Active'}</Chip>
              </>
            )}
          </p>
          <p className="t-caption">
            Unspent money right now: {money(data.held.earmarkedCents)} earmarked for gear, {money(data.held.fundCents)} in the team fund.
          </p>
        </div>
        {editable && t.status === 'live' && (
          <div className="flex flex-col gap-3 rounded-md border border-hairline-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="t-body">Closing the season moves unspent earmarked money to the team fund and emails every donor a summary.</p>
            <ButtonLink href={`/app/manager/${teamId}/settings/close-season`} variant="secondary">
              Close season
            </ButtonLink>
          </div>
        )}
        {editable && t.status === 'season_closed' && <NextSeason teamId={teamId} />}
        {t.status === 'draft' && <p className="t-caption">Season tools open once the team is live.</p>}
      </Section>

      {ctx.isCoach && (
        <Section title="Danger zone" id="danger">
          <DeleteTeam teamId={teamId} teamName={t.name} heldCents={data.held.totalCents} />
        </Section>
      )}
    </div>
  );
}
