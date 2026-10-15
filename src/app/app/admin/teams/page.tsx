import Link from 'next/link';
import { Search } from 'lucide-react';
import { requireAdmin } from '@/lib/auth/session';
import { sys } from '@/lib/db';
import { suspendTeam, reinstateTeam } from '@/lib/app/admin-actions';
import { money } from '@/lib/domain/money';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { Input, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { AdminAction } from '../_components/AdminAction';

export const metadata = { title: 'Teams' };

const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  draft: { label: 'Draft', tone: 'muted' },
  live: { label: 'Live', tone: 'funded' },
  season_closed: { label: 'Season closed', tone: 'neutral' },
  suspended: { label: 'Suspended', tone: 'error' },
};
const VERIFY: Record<string, { label: string; tone: ChipTone }> = {
  unverified: { label: 'Unverified', tone: 'muted' },
  under_review: { label: 'Under review', tone: 'warn' },
  verified: { label: 'Verified', tone: 'funded' },
  rejected: { label: 'Rejected', tone: 'error' },
};
const PAYOUTS: Record<string, { label: string; tone: ChipTone }> = {
  not_connected: { label: 'Not connected', tone: 'muted' },
  pending: { label: 'Pending', tone: 'warn' },
  connected: { label: 'Connected', tone: 'funded' },
  restricted: { label: 'Restricted', tone: 'error' },
};

function S({ map, v }: { map: Record<string, { label: string; tone: ChipTone }>; v: string }) {
  const s = map[v] ?? { label: v, tone: 'muted' as const };
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

interface Row {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  sport: string;
  status: string;
  verification_status: string;
  payouts_status: string;
  org_name: string;
  raised_cents: number;
  gifts: number;
  net_cents: number;
  athletes_live: number;
}

/** All teams with status, verification, payouts and totals; suspend or reinstate (ui-ux-spec 9). */
export default async function AdminTeamsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireAdmin();
  const { q = '', status = '' } = await searchParams;
  const term = q.trim().slice(0, 80);
  const st = Object.keys(STATUS).includes(status) ? status : '';
  const rows = await sys.query<Row>(
    `select t.id, t.name, t.slug, t.city, t.state, t.sport, t.status, t.verification_status, t.payouts_status, o.name as org_name,
       coalesce(tt.raised_cents, 0)::int as raised_cents, coalesce(tt.athletes_live, 0)::int as athletes_live,
       (select count(*) from donations d where d.team_id = t.id and d.status = 'succeeded')::int as gifts,
       (select coalesce(sum(d.net_cents), 0) from donations d where d.team_id = t.id and d.status = 'succeeded')::int as net_cents
     from teams t join organizations o on o.id = t.org_id left join team_totals tt on tt.team_id = t.id
     where ($1 = '' or t.name ilike '%' || $1 || '%' or o.name ilike '%' || $1 || '%' or t.slug ilike '%' || $1 || '%' or t.city ilike '%' || $1 || '%')
       and ($2 = '' or t.status::text = $2)
     order by t.last_activity_at desc limit 100`,
    [term, st],
  );

  const actions = (t: Row) =>
    t.status === 'suspended' ? (
      <AdminAction
        action={reinstateTeam.bind(null, t.id)}
        label="Reinstate"
        srLabel={`Reinstate ${t.name}`}
        size="sm"
        confirm={{ title: `Reinstate ${t.name}?`, body: 'The team goes back to the status it had before. The coaches are emailed.' }}
        reason={{ label: 'Note for the coaches', optional: true }}
      />
    ) : (
      <AdminAction
        action={suspendTeam.bind(null, t.id)}
        label="Suspend"
        srLabel={`Suspend ${t.name}`}
        size="sm"
        variant="destructive"
        confirm={{ title: `Suspend ${t.name}?`, body: 'The team page is hidden and new gifts stop. Money already raised stays with the team. The coaches get your reason by email.' }}
        reason={{ label: 'Reason' }}
      />
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Teams" sub={`${rows.length === 100 ? 'First 100' : rows.length} ${rows.length === 1 ? 'team' : 'teams'}${term ? ` matching "${term}"` : ''}.`} />
      <form role="search" className="-mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" action="/app/admin/teams">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="team-q" className="t-label">
            Search teams
          </label>
          <Input id="team-q" name="q" defaultValue={term} placeholder="Team, school, town or slug" />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-48">
          <label htmlFor="team-status" className="t-label">
            Status
          </label>
          <Select id="team-status" name="status" defaultValue={st}>
            <option value="">Any status</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          <Search size={18} aria-hidden /> Search
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState action={<Link href="/app/admin/teams">Clear the search</Link>}>No teams match.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-md border border-hairline-soft">
          <table className="hidden w-full text-left text-[15px] lg:table">
            <caption className="sr-only">Teams</caption>
            <thead className="bg-chrome">
              <tr>
                <th scope="col" className="t-label px-4 py-2.5">Team</th>
                <th scope="col" className="t-label px-4 py-2.5">Status</th>
                <th scope="col" className="t-label px-4 py-2.5">Verification</th>
                <th scope="col" className="t-label px-4 py-2.5">Payouts</th>
                <th scope="col" className="t-label px-4 py-2.5 text-right">Raised this season</th>
                <th scope="col" className="t-label px-4 py-2.5 text-right">Gifts, all time</th>
                <th scope="col" className="t-label px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {rows.map((t) => (
                <tr key={t.id} className="align-middle">
                  <td className="px-4 py-3">
                    <Link href={`/app/manager/${t.id}`} className="font-medium">
                      {t.name}
                    </Link>
                    <div className="t-caption">
                      {t.org_name} · {t.city}, {t.state} · {t.athletes_live} live {t.athletes_live === 1 ? 'player' : 'players'}
                    </div>
                  </td>
                  <td className="px-4 py-3"><S map={STATUS} v={t.status} /></td>
                  <td className="px-4 py-3"><S map={VERIFY} v={t.verification_status} /></td>
                  <td className="px-4 py-3"><S map={PAYOUTS} v={t.payouts_status} /></td>
                  <td className="px-4 py-3 text-right tabular text-ink">{money(t.raised_cents)}</td>
                  <td className="px-4 py-3 text-right tabular text-ink">
                    {money(t.net_cents)}
                    <div className="t-caption">{t.gifts} {t.gifts === 1 ? 'gift' : 'gifts'}</div>
                  </td>
                  <td className="px-4 py-3 text-right">{actions(t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-hairline-soft lg:hidden" aria-label="Teams">
            {rows.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 px-4 py-3">
                <Link href={`/app/manager/${t.id}`} className="text-[16px] font-medium">
                  {t.name}
                </Link>
                <p className="t-caption">
                  {t.org_name} · {t.city}, {t.state}
                </p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
                  <div><dt className="t-caption">Status</dt><dd><S map={STATUS} v={t.status} /></dd></div>
                  <div><dt className="t-caption">Verification</dt><dd><S map={VERIFY} v={t.verification_status} /></dd></div>
                  <div><dt className="t-caption">Payouts</dt><dd><S map={PAYOUTS} v={t.payouts_status} /></dd></div>
                  <div><dt className="t-caption">Raised this season</dt><dd className="tabular text-ink">{money(t.raised_cents)}</dd></div>
                  <div><dt className="t-caption">Gifts, all time</dt><dd className="tabular text-ink">{money(t.net_cents)} ({t.gifts})</dd></div>
                  <div><dt className="t-caption">Live players</dt><dd className="tabular text-ink">{t.athletes_live}</dd></div>
                </dl>
                <div>{actions(t)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
