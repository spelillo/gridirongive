import Link from 'next/link';
import { loadAthleteCtx } from '@/lib/app/athlete';
import { sys } from '@/lib/db';
import { formatDateTime } from '@/lib/domain/text';
import { possessive } from '@/lib/domain/names';
import { ButtonLink } from '@/components/ui/Button';
import { AthleteStatusChip } from '@/components/ui/Chip';
import { GuardianControls } from './GuardianControls';

export const metadata = { title: 'Profile and privacy' };

/** Profile and privacy (ui-ux-spec 7.8). */
export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadAthleteCtx(id);
  const a = ctx.athlete;
  const guardian = ctx.role === 'guardian';
  const consent = guardian
    ? await sys.one<{ signed_name: string; signed_at: Date; policy_version: string }>(
        `select signed_name, signed_at, policy_version from consents where athlete_id = $1 and withdrawn_at is null order by signed_at desc limit 1`,
        [id],
      )
    : null;
  const held = await sys.one<{ c: number }>(
    `select coalesce(sum(raised_cents), 0)::int as c from needs where athlete_id = $1 and raised_cents > 0 and status not in ('delivered', 'removed')`,
    [id],
  );

  return (
    <div className="flex max-w-[720px] flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="t-hero">Profile and privacy</h1>
        <div className="flex items-center gap-2">
          <span className="t-caption">Page status</span>
          <AthleteStatusChip status={a.status} />
        </div>
      </header>

      <section aria-labelledby="edit-h" className="flex flex-col gap-3">
        <h2 id="edit-h" className="t-subhead">
          Profile
        </h2>
        <p className="t-body">
          {ctx.team.requireProfileApproval ? `Changes to the photo and bio go to ${ctx.team.coach} before they show.` : 'Changes show on the page right away.'}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink href={`/app/athlete/${id}/setup?step=0`} variant="secondary">
            Edit name
          </ButtonLink>
          <ButtonLink href={`/app/athlete/${id}/setup?step=1`} variant="secondary">
            Edit photo
          </ButtonLink>
          <ButtonLink href={`/app/athlete/${id}/setup?step=3`} variant="secondary">
            Edit bio
          </ButtonLink>
        </div>
      </section>

      {guardian ? (
        <GuardianControls
          athleteId={id}
          first={a.first}
          status={a.status}
          hiddenReason={a.hiddenReason}
          showFullLastName={a.showFullLastName}
          athleteCanEdit={a.athleteCanEdit}
          under13={a.under13}
          hasPhoto={Boolean(a.photoPath || a.pubPhotoPath)}
          heldCents={held?.c ?? 0}
          consentLine={consent ? `Consent given by ${consent.signed_name} on ${formatDateTime(consent.signed_at)} (policy ${consent.policy_version}).` : null}
        />
      ) : (
        <section aria-labelledby="priv-h" className="flex flex-col gap-2">
          <h2 id="priv-h" className="t-subhead">
            Privacy
          </h2>
          <p className="t-body">
            Your parent or guardian controls who sees your full last name and can hide or delete your page. Your page only opens for people with the team code or your
            personal link.
          </p>
          <p className="t-caption">
            Something wrong? <Link href="/report">Report a concern</Link>.
          </p>
        </section>
      )}

      <section aria-labelledby="data-h" className="flex flex-col gap-2 border-t border-hairline-soft pt-6">
        <h2 id="data-h" className="t-subhead">
          Your data
        </h2>
        <p className="t-body">Download everything stored about {ctx.role === 'athlete' ? 'you' : possessive(a.first) + ' page'}: profile, gear, supporters (names only) and the consent record.</p>
        <div>
          <ButtonLink href={`/api/athletes/${id}/export`} variant="secondary" prefetch={false}>
            Download data
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
