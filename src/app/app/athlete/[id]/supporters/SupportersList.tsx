'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Field, Textarea } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Banner';
import { useToast } from '@/components/ui/Toast';
import { money } from '@/lib/domain/money';
import { formatDate } from '@/lib/domain/text';
import { cn } from '@/components/ui/cn';

export interface SupporterRow {
  id: string;
  name: string;
  date: string | null;
  message: string | null;
  amountCents: number | null;
  items: { id: string; name: string }[];
  thanked: boolean;
}

export function SupportersList({ athleteId, rows, openFor, first }: { athleteId: string; rows: SupporterRow[]; openFor: string | null; first: string }) {
  const [target, setTarget] = useState<SupporterRow | null>(() => (openFor ? (rows.find((r) => r.id === openFor) ?? null) : null));
  return (
    <>
      <div className="overflow-hidden rounded-md border border-hairline-soft">
        <table className="hidden w-full text-left text-[15px] md:table">
          <caption className="sr-only">Supporters</caption>
          <thead className="bg-chrome">
            <tr>
              <th scope="col" className="t-label px-4 py-2.5">Supporter</th>
              <th scope="col" className="t-label px-4 py-2.5">Item</th>
              <th scope="col" className="t-label px-4 py-2.5">Date</th>
              <th scope="col" className="t-label px-4 py-2.5">Message</th>
              <th scope="col" className="t-label px-4 py-2.5 text-right">Thank-you</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-4 py-3 font-medium text-ink">
                  {r.name}
                  {r.amountCents !== null && <div className="t-caption font-normal tabular">{money(r.amountCents)}</div>}
                </td>
                <td className="px-4 py-3 text-ink-body">{r.items.map((i) => i.name).join(', ')}</td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-meta">{r.date ? formatDate(r.date) : ''}</td>
                <td className="max-w-[280px] px-4 py-3 text-ink-body">{r.message ?? <span className="text-ink-meta">None</span>}</td>
                <td className="px-4 py-3 text-right">
                  <ThankCell row={r} onOpen={() => setTarget(r)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="divide-y divide-hairline-soft md:hidden">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-medium text-ink">{r.name}</span>
                <span className="t-caption">{r.date ? formatDate(r.date) : ''}</span>
              </div>
              <p className="t-caption">
                {r.items.map((i) => i.name).join(', ')}
                {r.amountCents !== null && ` · ${money(r.amountCents)}`}
              </p>
              {r.message && <p className="text-[15px] text-ink-body">{r.message}</p>}
              <div>
                <ThankCell row={r} onOpen={() => setTarget(r)} />
              </div>
            </li>
          ))}
        </ul>
      </div>
      {target && <Composer athleteId={athleteId} row={target} first={first} onClose={() => setTarget(null)} />}
    </>
  );
}

function ThankCell({ row, onOpen }: { row: SupporterRow; onOpen: () => void }) {
  if (row.thanked) {
    return (
      <span className="inline-flex min-h-9 items-center gap-1 text-[14px] text-funded">
        <Check size={16} aria-hidden /> Thanked
      </span>
    );
  }
  return (
    <Button variant="secondary" size="sm" onClick={onOpen}>
      Say thanks
    </Button>
  );
}

function Composer({ athleteId, row, first, onClose }: { athleteId: string; row: SupporterRow; first: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [to, setTo] = useState<string>('donation');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append('body', body);
    if (to === 'donation') form.append('donationId', row.id);
    else form.append('needId', to);
    if (photo) form.append('photo', await shrink(photo));
    const res = await fetch(`/api/athletes/${athleteId}/thanks`, { method: 'POST', body: form }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    if (!data?.ok) return setError(data?.error ?? 'Could not send. Try again.');
    toast(data.sent ? 'Thank-you sent' : 'Sent for approval');
    onClose();
    router.refresh();
  };
  return (
    <Sheet open onClose={onClose} title="Say thanks" size="md">
      <form onSubmit={send} className="flex flex-col gap-4">
        {error && <Banner tone="error">{error}</Banner>}
        <fieldset className="flex flex-col gap-2">
          <legend className="t-label mb-1">Send to</legend>
          {[{ id: 'donation', label: row.name }, ...row.items.map((i) => ({ id: i.id, label: `Everyone who gave to ${i.name}` }))].map((o) => (
            <label key={o.id} className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3', to === o.id ? 'border-primary bg-band-blue' : 'border-hairline-soft')}>
              <input type="radio" name="to" value={o.id} checked={to === o.id} onChange={() => setTo(o.id)} className="size-5 accent-primary" />
              <span className="text-[15px] text-ink-body">{o.label}</span>
            </label>
          ))}
        </fieldset>
        <Field id="ty-body" label="Your note" required labelAside={<span className="t-caption tabular">{body.length}/500</span>}>
          <Textarea id="ty-body" value={body} onChange={(e) => setBody(e.target.value.slice(0, 500))} rows={5} placeholder={`Thank you for helping me get my gear. - ${first}`} required />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="t-label">
            Photo <span className="font-normal text-ink-meta">Optional</span>
          </span>
          <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-md border border-hairline-soft px-3 text-[15px] text-primary hover:border-primary">
            <ImagePlus size={18} aria-hidden />
            {photo ? photo.name : 'Show them the gear'}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} loadingLabel="Sending" disabled={body.trim().length < 2}>
            Send
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

/** Resizes to 1600px max and re-encodes, which also strips EXIF location. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.85));
  return blob && blob.type === 'image/webp' ? blob : ((await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88))) ?? file);
}
