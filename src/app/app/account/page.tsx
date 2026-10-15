import { requireUser } from '@/lib/auth/session';
import { asUser } from '@/lib/db';
import { accountDeletionBlockers } from '@/lib/app/account';
import { AppShell, AppMain } from '@/components/app/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProfileForm, EmailPrefs, DeleteAccount } from './AccountForms';

export const metadata = { title: 'Account settings' };

/** Account settings: name, phone, email preferences (ui-ux-spec 8.13), sign out and delete. */
export default async function AccountPage() {
  const user = await requireUser('/app/account');
  const profile = await asUser(user.id, (tx) =>
    tx.one<{ full_name: string | null; phone: string | null; email: string; email_prefs: Record<string, string> | null }>(
      `select full_name, phone, email, email_prefs from profiles where id = $1`,
      [user.id],
    ),
  );
  const blockers = user.isAdmin ? ['Platform admin accounts are removed by taking the email out of ADMIN_EMAILS first.'] : await accountDeletionBlockers(user.id);
  const prefs = profile?.email_prefs ?? {};
  const pick = (k: string) => (prefs[k] === 'digest' || prefs[k] === 'off' ? prefs[k] : 'instant') as 'instant' | 'digest' | 'off';

  return (
    <AppShell user={user}>
      <AppMain>
        <div className="mx-auto flex max-w-[720px] flex-col gap-8">
          <PageHeader title="Account settings" sub={`Signed in as ${user.email}`} />

          <section aria-labelledby="profile-h" className="-mt-2 flex flex-col gap-4">
            <h2 id="profile-h" className="t-subhead">
              Your details
            </h2>
            <ProfileForm email={profile?.email ?? user.email} fullName={profile?.full_name ?? ''} phone={profile?.phone ?? ''} />
          </section>

          <section id="email" aria-labelledby="email-h" className="flex flex-col gap-4 border-t border-hairline-soft pt-8">
            <div className="flex flex-col gap-1">
              <h2 id="email-h" className="t-subhead">
                Email preferences
              </h2>
              <p className="t-body">Everything still shows under the bell in the app. These choices only change what is emailed.</p>
            </div>
            <EmailPrefs initial={{ donations: pick('donations'), approvals: pick('approvals'), updates: pick('updates') }} />
            <p className="t-caption">
              Receipts, refunds, sign-in links, invites, consent confirmations and payout problems are always emailed. They can&apos;t be turned off.
            </p>
          </section>

          <section aria-labelledby="signout-h" className="flex flex-col gap-3 border-t border-hairline-soft pt-8">
            <h2 id="signout-h" className="t-subhead">
              Sign out
            </h2>
            <p className="t-body">Signs you out on this device.</p>
            <form action="/auth/sign-out" method="post">
              <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-md border border-hairline bg-canvas px-4 py-3 text-[16px] font-medium text-primary-deep hover:bg-band-blue">
                Sign out
              </button>
            </form>
          </section>

          <section aria-labelledby="delete-h" className="flex flex-col gap-3 border-t border-hairline-soft pt-8">
            <h2 id="delete-h" className="t-subhead text-error">
              Delete my account
            </h2>
            {blockers.length > 0 ? (
              <>
                <p className="t-body">Your account can&apos;t be deleted yet:</p>
                <ul className="flex list-disc flex-col gap-1 pl-6 text-[15px] leading-[22px] text-ink-body">
                  {blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="t-body">
                  Removes your login, your name and phone number, and your notifications. Gifts you made stay in the teams&apos; records so receipts still work, but they are no longer linked to an
                  account. This can&apos;t be undone.
                </p>
                <DeleteAccount email={user.email} />
              </>
            )}
          </section>
        </div>
      </AppMain>
    </AppShell>
  );
}
