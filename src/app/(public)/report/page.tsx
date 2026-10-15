import type { Metadata } from 'next';
import { getAthleteRow, getTeamBySlug, isPubliclyVisible } from '@/lib/queries/public';
import { SITE } from '@/config/site';
import { ReportForm } from './ReportForm';

export const metadata: Metadata = { title: 'Report a problem', robots: { index: false, follow: true } };

type Props = { searchParams: Promise<{ team?: string | string[]; athlete?: string | string[] }> };

const slugOf = (v: string | string[] | undefined) => {
  const s = (Array.isArray(v) ? v[0] : v) ?? '';
  return /^[a-z0-9-]{1,120}$/.test(s) ? s : '';
};

/** Report a problem with a team or player page. Prefilled from ?team=&athlete=. */
export default async function ReportPage({ searchParams }: Props) {
  const sp = await searchParams;
  const teamSlug = slugOf(sp.team);
  const team = teamSlug ? await getTeamBySlug(teamSlug) : null;
  const visible = team && isPubliclyVisible(team) ? team : null;
  const athleteSlug = visible ? slugOf(sp.athlete) : '';
  const athlete = visible && athleteSlug ? await getAthleteRow(visible.id, athleteSlug) : null;
  // The player's name is never echoed here: the report form can be opened by anyone with the URL.
  const about = visible ? (athlete ? `A player page on ${visible.name}` : `${visible.name} team page`) : null;
  const backHref = visible ? (athlete ? `/t/${visible.slug}/${athleteSlug}` : `/t/${visible.slug}`) : null;

  return (
    <div className="page-x mx-auto flex w-full max-w-[640px] flex-col gap-6 py-8 md:py-12">
      <header className="flex flex-col gap-2">
        <h1 className="t-hero">Report a problem</h1>
        <p className="t-body">
          Tell us about personal information, inappropriate content or a team that doesn&apos;t look real. A Gridiron Give admin reviews every report. For a problem with your own
          gift, you can also email <a href={`mailto:${SITE.supportEmail}`} className="underline">{SITE.supportEmail}</a>.
        </p>
      </header>
      <ReportForm team={visible?.slug ?? ''} athlete={athlete ? athleteSlug : ''} about={about} backHref={backHref} />
    </div>
  );
}
