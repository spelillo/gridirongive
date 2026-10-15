'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Section } from '@/components/ui/PageHeader';
import { Field, Textarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { AthleteForm, toInput, type AthleteFormValues } from '@/components/manager/AthleteForm';
import { messageGuardian, updateAthlete } from '@/lib/app/team-actions';

interface Consent {
  signedName: string;
  email: string;
  signedAt: string;
  withdrawnAt: string | null;
  showFullLastName: boolean;
  athleteCanEdit: boolean;
  policyVersion: string;
}

/** Roster details, contacts, the consent record and "Message guardian" (ui-ux-spec 8.5). Staff only. */
export function DetailsTab({
  teamId,
  athleteId,
  sport,
  values,
  consent,
  access,
  invites,
}: {
  teamId: string;
  athleteId: string;
  sport: string;
  values: AthleteFormValues;
  consent: Consent | null;
  access: { role: string; name: string | null; email: string; since: string }[];
  invites: { email: string; role: string; sent: number; last: string; state: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [msg, setMsg] = useState('');
  const [msgErr, setMsgErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Section title="Roster details and contacts" id="details">
        <p className="t-caption -mt-2">Only team staff see contact details. Families never see each other&apos;s emails.</p>
        <AthleteForm
          initial={values}
          sport={sport}
          submitLabel="Save"
          onSubmit={async (v) => {
            const r = await updateAthlete(teamId, athleteId, toInput(v));
            if (!r.ok) return r.error;
            toast('Saved');
            router.refresh();
            return null;
          }}
        />
      </Section>

      <div className="flex flex-col gap-10">
        <Section title="Message guardians" id="msg">
          <p className="t-caption -mt-2">Sent by Gridiron Give to every guardian on file. Your email address isn&apos;t shared.</p>
          <Field id="msg-body" label="Message" error={msgErr}>
            <Textarea id="msg-body" value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={1000} rows={5} />
          </Field>
          <Button
            className="self-start"
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await messageGuardian(teamId, athleteId, msg);
                if (!r.ok) setMsgErr(r.error);
                else {
                  setMsgErr(null);
                  setMsg('');
                  toast(r.message ?? 'Sent');
                }
              })
            }
          >
            Send message
          </Button>
        </Section>

        <Section title="Consent" id="consent">
          {consent ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
              <dt className="text-ink-meta">Signed by</dt>
              <dd>
                {consent.signedName} ({consent.email})
              </dd>
              <dt className="text-ink-meta">Signed</dt>
              <dd>{consent.signedAt}</dd>
              {consent.withdrawnAt && (
                <>
                  <dt className="text-ink-meta">Withdrawn</dt>
                  <dd className="text-error">{consent.withdrawnAt}</dd>
                </>
              )}
              <dt className="text-ink-meta">Last name</dt>
              <dd>{consent.showFullLastName ? 'Full last name shown' : 'Last initial only'}</dd>
              <dt className="text-ink-meta">Athlete edits</dt>
              <dd>{consent.athleteCanEdit ? 'Allowed' : 'Guardian manages the page'}</dd>
              <dt className="text-ink-meta">Policy</dt>
              <dd>Version {consent.policyVersion}</dd>
            </dl>
          ) : (
            <p className="t-body">No consent yet. Nothing about this athlete is public until a guardian consents.</p>
          )}
        </Section>

        <Section title="Linked accounts" id="access">
          {access.length === 0 ? (
            <p className="t-body">No one has joined yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-[15px]">
              {access.map((x) => (
                <li key={x.email}>
                  <span className="font-medium">{x.name ?? x.email}</span>
                  <span className="text-ink-meta">
                    {' '}
                    · {x.role === 'guardian' ? 'Guardian' : 'Athlete'} · {x.email} · since {x.since}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {invites.length > 0 && (
            <>
              <h3 className="t-label mt-2">Invites</h3>
              <ul className="flex flex-col gap-1 text-[15px]">
                {invites.map((i) => (
                  <li key={i.email + i.role}>
                    {i.email} <span className="text-ink-meta">· {i.role} · {i.state} · sent {i.sent}x, last {i.last}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      </div>
    </div>
  );
}
