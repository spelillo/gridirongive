'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Field, Textarea } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { Banner } from '@/components/ui/Banner';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import { approveGearRequest, approveProfile, approveThankYou, rejectGearRequest, requestProfileChanges, returnThankYou, reviewMessages } from '@/lib/app/team-actions';
import { diffWords } from '@/lib/domain/diff';
import { RequestRow, type ManagerNeed } from '@/components/manager/GearRows';

type Res = { ok: boolean; message?: string; error?: string };

/** Desktop shortcuts: A approve, R request changes, J/K next/previous. Ignored while typing. */
function useShortcuts(map: Partial<Record<'a' | 'r' | 'j' | 'k', () => void>>) {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
      const fn = ref.current[e.key.toLowerCase() as 'a'];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function Shortcuts() {
  return (
    <p className="t-caption hidden lg:block">
      Shortcuts: <kbd className="rounded border border-hairline px-1">A</kbd> approve, <kbd className="rounded border border-hairline px-1">R</kbd> request changes,{' '}
      <kbd className="rounded border border-hairline px-1">J</kbd> next, <kbd className="rounded border border-hairline px-1">K</kbd> previous
    </p>
  );
}

function useRun() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Res>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? (r.message ?? 'Done') : (r.error ?? 'Something went wrong.'));
      if (r.ok) after?.();
      router.refresh();
    });
  return { pending, run };
}

// Profiles --------------------------------------------------------------------

interface ProfileVersion {
  displayName: string;
  bio: string;
  photo: string | null;
  photoKey: string | null;
  alt: string | null;
}
interface ProfileItem {
  id: string;
  name: string;
  jersey: string | null;
  position: string | null;
  live: boolean;
  consent: boolean;
  submitted: string | null;
  next: ProfileVersion;
  current: ProfileVersion | null;
}

export function ProfileQueue({ teamId, items, canEdit, initial, teamName }: { teamId: string; items: ProfileItem[]; canEdit: boolean; initial?: string; teamName: string }) {
  const [selId, setSelId] = useState(initial && items.some((i) => i.id === initial) ? initial : items[0]?.id);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const { pending, run } = useRun();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const idx = Math.max(0, items.findIndex((i) => i.id === selId));
  const sel = items[idx];
  const go = (d: number) => {
    const n = items[Math.min(items.length - 1, Math.max(0, idx + d))];
    if (n) {
      setSelId(n.id);
      setNoteFor(null);
    }
  };
  const advance = () => {
    const n = items[idx + 1] ?? items[idx - 1];
    setSelId(n?.id);
    setNoteFor(null);
    setNote('');
  };
  const approve = () => sel && canEdit && sel.consent && !pending && run(() => approveProfile(teamId, sel.id), advance);
  const openNote = () => {
    if (!sel || !canEdit) return;
    setNoteFor(sel.id);
    requestAnimationFrame(() => noteRef.current?.focus());
  };
  useShortcuts({ a: approve, r: openNote, j: () => go(1), k: () => go(-1) });

  if (!items.length) return <EmptyState>No profiles waiting. New submissions show up here.</EmptyState>;

  const changed = {
    name: !sel.current || sel.current.displayName !== sel.next.displayName,
    photo: !sel.current || sel.current.photoKey !== sel.next.photoKey,
    bio: !sel.current || sel.current.bio !== sel.next.bio,
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Profiles waiting" className="lg:sticky lg:top-[84px] lg:self-start">
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-0 lg:overflow-visible lg:rounded-md lg:border lg:border-hairline-soft">
          {items.map((i) => (
            <li key={i.id} className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelId(i.id);
                  setNoteFor(null);
                }}
                aria-current={i.id === sel.id ? 'true' : undefined}
                className={cn(
                  'flex min-h-11 w-full items-center gap-3 rounded-md border px-3 py-2 text-left lg:rounded-none lg:border-0 lg:border-l-[3px]',
                  i.id === sel.id ? 'border-primary bg-band-blue' : 'border-hairline-soft hover:bg-band lg:border-transparent',
                )}
              >
                <span className="flex flex-col">
                  <span className="text-[15px] font-medium text-ink">{i.name}</span>
                  <span className="t-caption">{i.live ? 'Edits to a live page' : 'New page'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="pq-h" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="pq-h" className="t-subhead">
              {sel.name}
              {sel.jersey && <span className="font-normal text-ink-meta"> #{sel.jersey}</span>}
            </h2>
            <p className="t-caption">
              {sel.live ? 'Live page with new edits' : 'New page'}
              {sel.submitted ? ` · submitted ${sel.submitted}` : ''} · {idx + 1} of {items.length}
            </p>
          </div>
          <Link href={`/app/manager/${teamId}/roster/${sel.id}`} className="text-[15px]">
            Open athlete
          </Link>
        </div>
        {!sel.consent && <Banner tone="warn" rounded>A guardian hasn&apos;t given consent yet, so this page can&apos;t be approved.</Banner>}

        <div className={cn('grid gap-4', sel.current && 'md:grid-cols-2')}>
          {sel.current && <Version label="Live now" v={sel.current} other={sel.next} changed={changed} side="before" teamName={teamName} />}
          <Version label={sel.current ? 'After approval' : 'Preview as donors will see it'} v={sel.next} other={sel.current} changed={changed} side="after" teamName={teamName} />
        </div>

        {canEdit && noteFor !== sel.id && (
          <div className="flex flex-wrap items-center gap-3">
            <Button loading={pending} disabled={!sel.consent} onClick={approve}>
              Approve
            </Button>
            <Button variant="secondary" onClick={openNote}>
              Request changes
            </Button>
            <Shortcuts />
          </div>
        )}
        {canEdit && noteFor === sel.id && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => requestProfileChanges(teamId, sel.id, note), advance);
            }}
          >
            <Field id="pq-note" label="What should change?" required helper="The athlete and guardian see this note.">
              <Textarea id="pq-note" ref={noteRef} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} aria-describedby="pq-note-help" />
            </Field>
            <div className="flex gap-3">
              <Button type="submit" loading={pending} disabled={note.trim().length < 5}>
                Send request
              </Button>
              <Button type="button" variant="secondary" onClick={() => setNoteFor(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function Version({
  label,
  v,
  other,
  changed,
  side,
  teamName,
}: {
  label: string;
  v: ProfileVersion;
  other: ProfileVersion | null;
  changed: { name: boolean; photo: boolean; bio: boolean };
  side: 'before' | 'after';
  teamName: string;
}) {
  const mark = (on: boolean) => (on && other ? 'rounded-sm ring-2 ring-warn ring-offset-2' : '');
  const parts = other ? (side === 'after' ? diffWords(other.bio, v.bio) : diffWords(v.bio, other.bio)) : null;
  return (
    <article className="flex flex-col gap-4 rounded-md border border-hairline-soft p-4" aria-label={label}>
      <p className="t-label text-ink-meta">{label}</p>
      <div className={cn('aspect-[3/4] w-full max-w-[280px] overflow-hidden rounded-md bg-chrome', mark(changed.photo))}>
        {v.photo ? (
           
          <img src={v.photo} alt={v.alt ?? ''} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Avatar name={v.displayName} size={96} />
          </div>
        )}
      </div>
      {changed.photo && other && <Chip tone="warn">Photo {side === 'after' ? 'changed' : 'replaced'}</Chip>}
      <div className="flex flex-col gap-1">
        <h3 className={cn('t-heading text-[24px]', mark(changed.name))}>{v.displayName}</h3>
        <p className="t-caption">{teamName}</p>
      </div>
      <div className={cn('t-body whitespace-pre-line', mark(changed.bio))}>
        {parts
          ? parts.map((p, i) =>
              p.kind === 'same' ? (
                <span key={i}>{p.text}</span>
              ) : (side === 'after' && p.kind === 'added') || (side === 'before' && p.kind === 'removed') ? (
                side === 'after' ? (
                  <ins key={i} className="bg-funded-bg text-ink no-underline">
                    {p.text}
                  </ins>
                ) : (
                  <del key={i} className="bg-error-bg text-ink">
                    {p.text}
                  </del>
                )
              ) : null,
            )
          : v.bio || <span className="text-ink-meta">No bio.</span>}
      </div>
    </article>
  );
}

// Gear requests --------------------------------------------------------------

export function GearQueue({ teamId, items, canEdit }: { teamId: string; items: { athleteId: string; athlete: string; requested: string; need: ManagerNeed }[]; canEdit: boolean }) {
  const { pending, run } = useRun();
  if (!items.length) return <EmptyState>No gear requests. When a player asks for an item, it shows up here.</EmptyState>;
  return (
    <ul className="flex max-w-[760px] flex-col gap-5">
      {items.map((i) => (
        <li key={i.need.id} className="flex flex-col gap-2">
          <p className="text-[15px]">
            <Link href={`/app/manager/${teamId}/roster/${i.athleteId}`} className="font-medium">
              {i.athlete}
            </Link>
            <span className="text-ink-meta"> · asked {i.requested}</span>
          </p>
          <ul>
            <RequestRow
              n={i.need}
              canEdit={canEdit}
              busy={pending}
              onApprove={(c) => run(() => approveGearRequest(teamId, i.need.id, c))}
              onReject={(note) => run(() => rejectGearRequest(teamId, i.need.id, note))}
            />
          </ul>
        </li>
      ))}
    </ul>
  );
}

// Donor messages ------------------------------------------------------------

export function MessageQueue({
  teamId,
  items,
  canEdit,
}: {
  teamId: string;
  items: { id: string; donor: string; realName: string; to: string; message: string; flagged: boolean; date: string }[];
  canEdit: boolean;
}) {
  const { pending, run } = useRun();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const ids = items.filter((i) => sel.has(i.id)).map((i) => i.id);
  const focusRow = (n: number) => {
    const c = Math.min(items.length - 1, Math.max(0, n));
    setCursor(c);
    rowRefs.current[c]?.scrollIntoView({ block: 'nearest' });
  };
  useShortcuts({
    j: () => focusRow(cursor + 1),
    k: () => focusRow(cursor - 1),
    a: () => canEdit && items[cursor] && run(() => reviewMessages(teamId, [items[cursor].id], true)),
    r: () => canEdit && items[cursor] && run(() => reviewMessages(teamId, [items[cursor].id], false)),
  });
  if (!items.length) return <EmptyState>No messages waiting. Donor notes to athletes show up here before the athlete sees them.</EmptyState>;
  const all = sel.size === items.length;
  return (
    <div className="flex max-w-[860px] flex-col gap-4">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 items-center gap-2 text-[15px]">
            <input type="checkbox" className="size-5 accent-primary" checked={all} onChange={() => setSel(all ? new Set() : new Set(items.map((i) => i.id)))} />
            Select all
          </label>
          <Button size="sm" disabled={!ids.length} loading={pending} onClick={() => run(() => reviewMessages(teamId, ids, true), () => setSel(new Set()))}>
            Approve {ids.length || ''}
          </Button>
          <Button size="sm" variant="secondary" disabled={!ids.length || pending} onClick={() => run(() => reviewMessages(teamId, ids, false), () => setSel(new Set()))}>
            Reject {ids.length || ''}
          </Button>
          <p className="t-caption hidden lg:block">
            <kbd className="rounded border border-hairline px-1">A</kbd> approve, <kbd className="rounded border border-hairline px-1">R</kbd> reject,{' '}
            <kbd className="rounded border border-hairline px-1">J</kbd>/<kbd className="rounded border border-hairline px-1">K</kbd> move
          </p>
        </div>
      )}
      <ul className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft">
        {items.map((m, i) => (
          <li
            key={m.id}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            className={cn('flex gap-3 px-4 py-3', i === cursor && 'bg-band')}
          >
            {canEdit && (
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0 accent-primary"
                aria-label={`Select message from ${m.donor}`}
                checked={sel.has(m.id)}
                onChange={() =>
                  setSel((s) => {
                    const n = new Set(s);
                    if (n.has(m.id)) n.delete(m.id);
                    else n.add(m.id);
                    return n;
                  })
                }
              />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="t-body">&ldquo;{m.message}&rdquo;</p>
              <p className="t-caption">
                From {m.donor}
                {m.donor !== m.realName ? ` (${m.realName}, hidden from the athlete)` : ''} to {m.to} · {m.date}
              </p>
              {m.flagged && (
                <p className="flex items-center gap-1 text-[14px] text-warn">
                  <AlertTriangle size={14} aria-hidden /> Contains a link, contact detail or flagged word. Read carefully.
                </p>
              )}
            </div>
            {canEdit && (
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => reviewMessages(teamId, [m.id], true))}>
                  Approve
                </Button>
                <Button size="sm" variant="tertiary" disabled={pending} onClick={() => run(() => reviewMessages(teamId, [m.id], false))}>
                  Reject
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Thank-yous -----------------------------------------------------------------

export function ThanksQueue({
  teamId,
  items,
  canEdit,
}: {
  teamId: string;
  items: { id: string; from: string; body: string; photo: string | null; to: string; recipients: number; flagged: boolean; date: string }[];
  canEdit: boolean;
}) {
  const { pending, run } = useRun();
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<{ id: string; kind: 'changes' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const cur = items[Math.min(cursor, items.length - 1)];
  const open = (kind: 'changes' | 'reject', id = cur?.id) => {
    if (!id || !canEdit) return;
    setMode({ id, kind });
    setNote('');
    requestAnimationFrame(() => noteRef.current?.focus());
  };
  useShortcuts({
    j: () => setCursor((c) => Math.min(items.length - 1, c + 1)),
    k: () => setCursor((c) => Math.max(0, c - 1)),
    a: () => canEdit && cur && !pending && run(() => approveThankYou(teamId, cur.id)),
    r: () => open('changes'),
  });
  if (!items.length) return <EmptyState>No thank-you notes waiting.</EmptyState>;
  return (
    <div className="flex max-w-[860px] flex-col gap-4">
      {canEdit && <Shortcuts />}
      <ul className="flex flex-col gap-4">
        {items.map((t, i) => (
          <li key={t.id} className={cn('flex flex-col gap-3 rounded-md border p-4', i === cursor ? 'border-primary' : 'border-hairline-soft')} onFocus={() => setCursor(i)}>
            <div className="flex flex-col gap-3 sm:flex-row">
              {t.photo && (
                 
                <img src={t.photo} alt={`Photo attached by ${t.from}`} className="h-40 w-32 shrink-0 rounded-md object-cover" />
              )}
              <div className="flex flex-col gap-1">
                <p className="t-body whitespace-pre-line">&ldquo;{t.body}&rdquo;</p>
                <p className="t-caption">
                  From {t.from} to {t.to} · {t.recipients} {t.recipients === 1 ? 'recipient' : 'recipients'} · {t.date}
                </p>
                {t.flagged && (
                  <p className="flex items-center gap-1 text-[14px] text-warn">
                    <AlertTriangle size={14} aria-hidden /> Contains a link, contact detail or flagged word.
                  </p>
                )}
              </div>
            </div>
            {canEdit && mode?.id !== t.id && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" loading={pending && i === cursor} disabled={pending} onClick={() => run(() => approveThankYou(teamId, t.id))}>
                  Approve and send
                </Button>
                <Button size="sm" variant="secondary" onClick={() => open('changes', t.id)}>
                  Request changes
                </Button>
                <Button size="sm" variant="tertiary" onClick={() => open('reject', t.id)}>
                  Reject
                </Button>
              </div>
            )}
            {canEdit && mode?.id === t.id && (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => returnThankYou(teamId, t.id, note, mode.kind), () => setMode(null));
                }}
              >
                <Field id={`ty-note-${t.id}`} label={mode.kind === 'changes' ? 'What should change?' : 'Note to the athlete'} required={mode.kind === 'changes'} optional={mode.kind === 'reject'}>
                  <Textarea id={`ty-note-${t.id}`} ref={noteRef} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} />
                </Field>
                <div className="flex gap-3">
                  <Button type="submit" size="sm" variant={mode.kind === 'reject' ? 'destructive' : 'primary'} loading={pending} disabled={mode.kind === 'changes' && note.trim().length < 5}>
                    {mode.kind === 'changes' ? 'Send back' : 'Reject note'}
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setMode(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
