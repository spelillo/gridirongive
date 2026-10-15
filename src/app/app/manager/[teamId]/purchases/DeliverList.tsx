'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, FileCheck2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Checkbox, Field } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { markDelivered } from '@/lib/app/team-money-actions';
import { uploadTeamFile } from '@/lib/app/upload-client';

export interface DeliverNeed {
  id: string;
  name: string;
  variant: string | null;
  who: string;
  vendor: string | null;
  purchasedAt: string;
  consent: boolean;
}

/** Purchased gear waiting to be handed out. Per item or in bulk, with an optional photo (ui-ux-spec 8.9). */
export function DeliverList({ teamId, needs, canEdit }: { teamId: string; needs: DeliverNeed[]; canEdit: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<string[] | null>(null);
  const allOn = needs.length > 0 && needs.every((n) => selected.has(n.id));
  const set = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  return (
    <div className="flex flex-col gap-3">
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Checkbox id="all-deliver" checked={allOn} onChange={(e) => setSelected(e.target.checked ? new Set(needs.map((n) => n.id)) : new Set())} label="Select all" />
          <Button disabled={!selected.size} onClick={() => setSheet([...selected])}>
            Mark {selected.size || ''} delivered
          </Button>
        </div>
      )}
      <ul className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft">
        {needs.map((n) => (
          <li key={n.id} className="flex flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
            {canEdit ? (
              <Checkbox
                id={`d-${n.id}`}
                checked={selected.has(n.id)}
                onChange={(e) => set(n.id, e.target.checked)}
                label={
                  <>
                    {n.name} <span className="text-ink-meta">· {n.who}</span>
                  </>
                }
                hint={[n.variant, n.vendor ? `Bought from ${n.vendor}` : null, n.purchasedAt].filter(Boolean).join(' · ')}
              />
            ) : (
              <p className="py-2">
                {n.name} <span className="text-ink-meta">· {n.who}</span>
              </p>
            )}
            {canEdit && (
              <Button variant="secondary" size="sm" onClick={() => setSheet([n.id])}>
                Delivered<span className="sr-only">: {n.name} for {n.who}</span>
              </Button>
            )}
          </li>
        ))}
      </ul>
      {sheet && (
        <DeliverSheet
          teamId={teamId}
          needs={needs.filter((n) => sheet.includes(n.id))}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}

function DeliverSheet({ teamId, needs, onClose, onDone }: { teamId: string; needs: DeliverNeed[]; onClose: () => void; onDone: () => void }) {
  const [photo, setPhoto] = useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();
  const noConsent = needs.filter((n) => !n.consent);

  const submit = () =>
    start(async () => {
      const r = await markDelivered(
        teamId,
        needs.map((n) => n.id),
        photo?.key ?? null,
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast(r.message ?? 'Marked delivered');
      onDone();
      router.refresh();
    });

  return (
    <Sheet
      open
      onClose={onClose}
      locked={pending}
      title={needs.length === 1 ? `Mark ${needs[0].name} delivered` : `Mark ${needs.length} items delivered`}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending} loadingLabel="Saving" disabled={uploading}>
            Mark delivered
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <Banner tone="error" rounded>
            {error}
          </Banner>
        )}
        <ul className="t-list list-disc pl-5">
          {needs.map((n) => (
            <li key={n.id}>
              {n.name} for {n.who}
            </li>
          ))}
        </ul>
        {noConsent.length > 0 ? (
          <Banner tone="info" rounded>
            A photo needs guardian consent. {noConsent.map((n) => n.who).join(', ')} {noConsent.length === 1 ? "doesn't" : "don't"} have it, so this delivery can&apos;t include a photo.
          </Banner>
        ) : (
          <Field id="delivery-photo" label="Photo" optional helper='For example "Jayden in the new helmet". Donors get it with the update.'>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                id="delivery-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploading(true);
                  setError(null);
                  const r = await uploadTeamFile(teamId, 'delivery', f);
                  setUploading(false);
                  if (r.ok) setPhoto({ key: r.key, name: f.name });
                  else setError(r.error);
                }}
              />
              <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Spinner /> : <Camera size={18} aria-hidden />}
                {photo ? 'Replace photo' : 'Add a photo'}
              </Button>
              <span className="t-caption" aria-live="polite">
                {uploading ? 'Uploading' : photo ? (
                  <span className="inline-flex items-center gap-1.5 text-funded">
                    <FileCheck2 size={16} aria-hidden /> {photo.name}
                  </span>
                ) : null}
              </span>
            </div>
          </Field>
        )}
        <p className="t-caption">Donors of these items get a delivered email.</p>
      </div>
    </Sheet>
  );
}
