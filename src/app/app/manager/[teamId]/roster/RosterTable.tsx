'use client';
import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Upload, UserPlus, MoreVertical, X } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Input, Select, Checkbox, Field } from '@/components/ui/Field';
import { AthleteStatusChip, Chip, INVITE_STATUS } from '@/components/ui/Chip';
import { Meter } from '@/components/ui/Meter';
import { Avatar } from '@/components/ui/Avatar';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { AthleteForm, toInput } from '@/components/manager/AthleteForm';
import { addAthlete, applyTemplate, inviteAthletes, removeAthletes, setAthletesHidden } from '@/lib/app/team-actions';
import type { RosterRow } from '@/lib/app/team-data';
import { percentFunded } from '@/lib/domain/money';
import { cn } from '@/components/ui/cn';

type Filter = { q: string; status: string; group: string; need: string; invite: string };

function profileLabel(r: RosterRow) {
  if (r.status === 'live' && r.pendingChanges) return 'pending_changes';
  return r.status;
}

function matches(r: RosterRow, f: Filter) {
  if (f.q) {
    const q = f.q.toLowerCase().trim();
    if (!`${r.name} ${r.firstName} ${r.lastName} ${r.jersey ?? ''} ${r.position ?? ''}`.toLowerCase().includes(q) && r.jersey !== q.replace('#', '')) return false;
  }
  if (f.status) {
    if (f.status === 'pending' && !(r.status === 'awaiting_coach' || r.pendingChanges)) return false;
    if (f.status !== 'pending' && r.status !== f.status) return false;
  }
  if (f.group && r.positionGroup !== f.group) return false;
  if (f.need === 'open' && r.openItems === 0) return false;
  if (f.need === 'funded' && !(r.goalCents > 0 && r.openItems === 0)) return false;
  if (f.need === 'none' && r.goalCents > 0) return false;
  if (f.invite === 'pending' && r.inviteStatus === 'accepted') return false;
  return true;
}

export function RosterTable({
  teamId,
  rows,
  templates,
  canEdit,
  initialFilter,
}: {
  teamId: string;
  rows: RosterRow[];
  templates: { id: string; name: string }[];
  canEdit: boolean;
  initialFilter: { invite: string; status: string };
}) {
  const base = `/app/manager/${teamId}`;
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState<Filter>({ q: '', status: initialFilter.status, group: '', need: '', invite: initialFilter.invite });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [sheet, setSheet] = useState<null | 'add' | 'template' | 'remove'>(null);
  const [pending, start] = useTransition();
  const visible = useMemo(() => rows.filter((r) => matches(r, f)), [rows, f]);
  // Selection is limited to what's on screen, so a filter change can't act on hidden rows.
  const chosen = visible.filter((r) => selected.has(r.id));
  const allOn = visible.length > 0 && chosen.length === visible.length;
  const filtered = Boolean(f.q || f.status || f.group || f.need || f.invite);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const clear = () => {
    setSelected(new Set());
    setSelecting(false);
  };
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? (r.message ?? 'Done') : (r.error ?? 'Something went wrong.'));
      if (r.ok) {
        clear();
        setSheet(null);
        router.refresh();
      }
    });
  const ids = chosen.map((r) => r.id);

  if (rows.length === 0) {
    return (
      <>
        <EmptyState
          action={
            canEdit && (
              <div className="flex flex-wrap justify-center gap-3">
                <ButtonLink href={`${base}/roster/import`}>Import roster</ButtonLink>
                <Button variant="secondary" onClick={() => setSheet('add')}>
                  Add one athlete
                </Button>
              </div>
            )
          }
        >
          No athletes yet.
        </EmptyState>
        <AddSheet open={sheet === 'add'} onClose={() => setSheet(null)} teamId={teamId} templates={templates} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <label htmlFor="roster-q" className="sr-only">
              Search the roster
            </label>
            <Search size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-meta" />
            <Input id="roster-q" type="search" placeholder="Search by name or number" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} className="pl-10" />
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setSheet('add')}>
                <UserPlus size={18} aria-hidden /> Add<span className="max-sm:hidden"> athlete</span>
              </Button>
              <ButtonLink href={`${base}/roster/import`} variant="secondary">
                <Upload size={18} aria-hidden /> Import
              </ButtonLink>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 md:flex">
          <FilterSelect id="rf-status" label="Profile" value={f.status} onChange={(status) => setF({ ...f, status })}>
            <option value="">Profile: all</option>
            <option value="needs_consent">Needs consent</option>
            <option value="draft">Draft</option>
            <option value="pending">Pending approval</option>
            <option value="changes_requested">Changes requested</option>
            <option value="live">Live</option>
            <option value="hidden">Hidden</option>
          </FilterSelect>
          <FilterSelect id="rf-group" label="Position" value={f.group} onChange={(group) => setF({ ...f, group })}>
            <option value="">Position: all</option>
            <option value="offense">Offense</option>
            <option value="defense">Defense</option>
            <option value="special">Special teams</option>
          </FilterSelect>
          <FilterSelect id="rf-need" label="Needs" value={f.need} onChange={(need) => setF({ ...f, need })}>
            <option value="">Needs: all</option>
            <option value="open">Has open items</option>
            <option value="funded">Fully funded</option>
            <option value="none">No gear list</option>
          </FilterSelect>
        </div>
      </div>

      <div className="flex min-h-6 flex-wrap items-center justify-between gap-2">
        <p className="t-caption" role="status" aria-live="polite">
          {filtered ? `${visible.length} of ${rows.length} shown` : `${rows.length} athletes`}
          {f.invite === 'pending' && (
            <>
              {' '}
              · Invite not accepted{' '}
              <button type="button" className="underline" onClick={() => setF({ ...f, invite: '' })}>
                Clear
              </button>
            </>
          )}
        </p>
        {canEdit && (
          <button type="button" className="text-[15px] text-primary md:hidden" onClick={() => (selecting ? clear() : setSelecting(true))}>
            {selecting ? 'Cancel' : 'Select'}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState action={<Button variant="secondary" onClick={() => setF({ q: '', status: '', group: '', need: '', invite: '' })}>Clear filters</Button>}>
          No athletes match these filters.
        </EmptyState>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[920px] text-left text-[15px]">
              <thead className="t-caption">
                <tr className="border-b border-hairline">
                  {canEdit && (
                    <th scope="col" className="w-11 py-2">
                      <input
                        type="checkbox"
                        aria-label="Select all shown"
                        className="size-5 accent-primary"
                        checked={allOn}
                        onChange={() => setSelected(allOn ? new Set() : new Set(visible.map((r) => r.id)))}
                      />
                    </th>
                  )}
                  <th scope="col" className="py-2 pr-3 font-medium">Athlete</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Pos</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Grade</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Invite</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Consent</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Profile</th>
                  <th scope="col" className="w-44 py-2 pr-3 font-medium">Funding</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Open</th>
                  <th scope="col" className="w-11 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className={cn('border-b border-hairline-soft', selected.has(r.id) && 'bg-band-blue')}>
                    {canEdit && (
                      <td className="py-2">
                        <input type="checkbox" aria-label={`Select ${r.name}`} className="size-5 accent-primary" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                      </td>
                    )}
                    <td className="py-2 pr-3">
                      <Link href={`${base}/roster/${r.id}`} className="flex items-center gap-3 font-medium text-ink no-underline hover:underline">
                        <Avatar name={r.name} src={r.photo} size={36} />
                        <span>
                          {r.name}
                          {r.jersey && <span className="font-normal text-ink-meta"> #{r.jersey}</span>}
                        </span>
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{r.position ?? <span className="text-ink-meta">None</span>}</td>
                    <td className="py-2 pr-3 tabular">{r.grade ?? <span className="text-ink-meta">None</span>}</td>
                    <td className="py-2 pr-3"><InviteChip status={r.inviteStatus} hasEmail={r.hasGuardianEmail} /></td>
                    <td className="py-2 pr-3">{r.consent ? <Chip tone="funded" icon="check">Given</Chip> : <Chip tone="warn" icon="clock">Pending</Chip>}</td>
                    <td className="py-2 pr-3"><ProfileChip r={r} /></td>
                    <td className="py-2 pr-3">
                      {r.goalCents > 0 ? (
                        <div className="flex items-center gap-2">
                          <Meter raised={r.raisedCents} goal={r.goalCents} showText={false} className="flex-1" label={`${r.name} ${percentFunded(r.raisedCents, r.goalCents)}% funded`} />
                          <span className="t-caption w-10 text-right tabular">{percentFunded(r.raisedCents, r.goalCents)}%</span>
                        </div>
                      ) : (
                        <span className="t-caption">No gear list</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular">{r.openItems}</td>
                    <td className="py-2">
                      <RowMenu r={r} base={base} canEdit={canEdit} busy={pending} onAction={(a) => run(a)} teamId={teamId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {visible.map((r) => (
              <MobileCard
                key={r.id}
                r={r}
                href={`${base}/roster/${r.id}`}
                selecting={canEdit && (selecting || selected.size > 0)}
                selected={selected.has(r.id)}
                onToggle={() => toggle(r.id)}
                onLongPress={() => {
                  if (!canEdit) return;
                  setSelecting(true);
                  toggle(r.id);
                }}
              />
            ))}
          </ul>
        </>
      )}

      {canEdit && chosen.length > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="fixed inset-x-0 bottom-14 z-30 border-t border-hairline bg-canvas px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] lg:sticky lg:bottom-4 lg:rounded-md lg:border"
        >
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-2">
            <span className="mr-2 text-[15px] font-medium">{chosen.length} selected</span>
            <Button size="sm" loading={pending} onClick={() => run(() => inviteAthletes(teamId, ids))}>
              Send invite
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setSheet('template')}>
              Apply gear template
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setAthletesHidden(teamId, ids, true))}>
              Hide
            </Button>
            {chosen.some((r) => r.status === 'hidden') && (
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setAthletesHidden(teamId, ids, false))}>
                Show
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={() => setSheet('remove')}>
              Remove
            </Button>
            <button type="button" onClick={clear} className="ml-auto flex size-11 items-center justify-center rounded-md hover:bg-band" aria-label="Clear selection">
              <X size={20} aria-hidden />
            </button>
          </div>
        </div>
      )}

      <AddSheet open={sheet === 'add'} onClose={() => setSheet(null)} teamId={teamId} templates={templates} />
      <TemplateSheet open={sheet === 'template'} onClose={() => setSheet(null)} teamId={teamId} templates={templates} ids={ids} onDone={() => { clear(); router.refresh(); }} />
      <Sheet
        open={sheet === 'remove'}
        onClose={() => setSheet(null)}
        title={`Remove ${chosen.length} from the roster?`}
        footer={
          <div className="flex flex-wrap gap-3">
            <Button variant="destructive" loading={pending} onClick={() => run(() => removeAthletes(teamId, ids))}>
              Remove
            </Button>
            <Button variant="secondary" onClick={() => setSheet(null)}>
              Cancel
            </Button>
          </div>
        }
      >
        <p className="t-body">
          Their pages come down and their invites stop working. Athletes with gifts toward gear that hasn&apos;t been delivered stay on the roster until that gear is delivered or the funds are moved.
        </p>
        {chosen.some((r) => r.heldCents > 0) && (
          <p className="mt-3 t-body">
            Can&apos;t remove yet: {chosen.filter((r) => r.heldCents > 0).map((r) => r.name).join(', ')}.
          </p>
        )}
      </Sheet>
    </div>
  );
}

function FilterSelect({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="md:w-48">
        {children}
      </Select>
    </div>
  );
}

function InviteChip({ status, hasEmail }: { status: string; hasEmail: boolean }) {
  if (status === 'not_sent' && !hasEmail) return <Chip tone="error" icon="alert">No email</Chip>;
  const s = INVITE_STATUS[status] ?? { label: status, tone: 'muted' as const };
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

function ProfileChip({ r }: { r: RosterRow }) {
  if (profileLabel(r) === 'pending_changes') return <Chip tone="warn" icon="clock">Changes pending</Chip>;
  return <AthleteStatusChip status={r.status} />;
}

function RowMenu({ r, base, canEdit, busy, onAction, teamId }: { r: RosterRow; base: string; canEdit: boolean; busy: boolean; teamId: string; onAction: (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => ref.current?.removeAttribute('open');
  return (
    <details ref={ref} className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && close()}>
      <summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-md hover:bg-band [&::-webkit-details-marker]:hidden" aria-label={`Actions for ${r.name}`}>
        <MoreVertical size={20} aria-hidden />
      </summary>
      <ul className="absolute right-0 z-20 mt-1 w-52 rounded-md border border-hairline bg-canvas py-1 shadow-lg">
        <MenuLink href={`${base}/roster/${r.id}`}>Open</MenuLink>
        <MenuLink href={`${base}/roster/${r.id}?tab=gear`}>Edit gear</MenuLink>
        {canEdit && r.inviteStatus !== 'accepted' && r.hasGuardianEmail && (
          <MenuButton disabled={busy} onClick={() => { close(); onAction(() => inviteAthletes(teamId, [r.id])); }}>
            {r.inviteStatus === 'not_sent' ? 'Send invite' : 'Resend invite'}
          </MenuButton>
        )}
        {canEdit && r.status !== 'hidden' && r.status !== 'needs_consent' && (
          <MenuButton disabled={busy} onClick={() => { close(); onAction(() => setAthletesHidden(teamId, [r.id], true)); }}>
            Hide page
          </MenuButton>
        )}
        {canEdit && r.status === 'hidden' && r.hiddenReason === 'manager' && (
          <MenuButton disabled={busy} onClick={() => { close(); onAction(() => setAthletesHidden(teamId, [r.id], false)); }}>
            Show page
          </MenuButton>
        )}
      </ul>
    </details>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex min-h-11 items-center px-4 text-[15px] text-ink no-underline hover:bg-band">
        {children}
      </Link>
    </li>
  );
}

function MenuButton({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <li>
      <button type="button" disabled={disabled} onClick={onClick} className="flex min-h-11 w-full items-center px-4 text-left text-[15px] text-ink hover:bg-band disabled:opacity-50">
        {children}
      </button>
    </li>
  );
}

function MobileCard({ r, href, selecting, selected, onToggle, onLongPress }: { r: RosterRow; href: string; selecting: boolean; selected: boolean; onToggle: () => void; onLongPress: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(false);
  const startPress = () => {
    pressed.current = false;
    timer.current = setTimeout(() => {
      pressed.current = true;
      onLongPress();
    }, 500);
  };
  const endPress = () => timer.current && clearTimeout(timer.current);
  const body = (
    <div className="flex items-start gap-3">
      <Avatar name={r.name} src={r.photo} size={44} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[16px] font-medium text-ink">
          {r.name}
          {r.jersey && <span className="font-normal text-ink-meta"> #{r.jersey}</span>}
          {r.position && <span className="font-normal text-ink-meta"> · {r.position}</span>}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <ProfileChip r={r} />
          {!r.consent && <Chip tone="warn" icon="clock">Consent pending</Chip>}
          {r.inviteStatus !== 'accepted' && <InviteChip status={r.inviteStatus} hasEmail={r.hasGuardianEmail} />}
        </div>
        {r.goalCents > 0 && (
          <div className="flex items-center gap-2">
            <Meter raised={r.raisedCents} goal={r.goalCents} showText={false} className="flex-1" label={`${r.name} ${percentFunded(r.raisedCents, r.goalCents)}% funded`} />
            <span className="t-caption tabular">
              {percentFunded(r.raisedCents, r.goalCents)}% · {r.openItems} open
            </span>
          </div>
        )}
      </div>
    </div>
  );
  return (
    <li className={cn('rounded-md border border-hairline-soft', selected && 'border-primary bg-band-blue')}>
      {selecting ? (
        <label className="flex cursor-pointer items-start gap-3 p-3">
          <input type="checkbox" className="mt-3 size-5 accent-primary" checked={selected} onChange={onToggle} aria-label={`Select ${r.name}`} />
          <div className="flex-1">{body}</div>
        </label>
      ) : (
        <Link
          href={href}
          className="block p-3 text-ink no-underline select-none"
          onPointerDown={startPress}
          onPointerUp={endPress}
          onPointerLeave={endPress}
          onPointerCancel={endPress}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => {
            if (pressed.current) e.preventDefault();
          }}
        >
          {body}
        </Link>
      )}
    </li>
  );
}

function AddSheet({ open, onClose, teamId, templates }: { open: boolean; onClose: () => void; teamId: string; templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [another, setAnother] = useState(0);
  return (
    <Sheet open={open} onClose={onClose} title="Add athlete" size="lg" initialFocusSelector="#af-first">
      <AthleteForm
        key={another}
        create
        templates={templates}
        submitLabel="Add athlete"
        onCancel={onClose}
        onSubmit={async (v, opts) => {
          const r = await addAthlete(teamId, toInput(v), { sendInvite: opts.sendInvite, templateId: opts.templateId });
          if (!r.ok) return r.error;
          toast(r.message ?? `Added ${v.firstName}.`);
          setAnother((n) => n + 1);
          router.refresh();
          onClose();
          return null;
        }}
      />
    </Sheet>
  );
}

function TemplateSheet({ open, onClose, teamId, templates, ids, onDone }: { open: boolean; onClose: () => void; teamId: string; templates: { id: string; name: string }[]; ids: string[]; onDone: () => void }) {
  const toast = useToast();
  const [templateId, setTemplateId] = useState('auto');
  const [replace, setReplace] = useState(false);
  const [preview, setPreview] = useState<{ key: string; add: number; remove: number; athletes: number } | null>(null);
  const [pending, start] = useTransition();
  const key = `${templateId}|${replace}|${ids.join(',')}`;
  const current = preview?.key === key ? preview : null;
  const check = () =>
    start(async () => {
      const r = await applyTemplate(teamId, templateId, { kind: 'selected', ids }, { replace, dryRun: true });
      if (r.ok && r.data) setPreview({ key, ...r.data });
      else if (!r.ok) toast(r.error);
    });
  const apply = () =>
    start(async () => {
      const r = await applyTemplate(teamId, templateId, { kind: 'selected', ids }, { replace, dryRun: false });
      toast(r.ok ? (r.message ?? 'Applied') : r.error);
      if (r.ok) {
        setPreview(null);
        onDone();
        onClose();
      }
    });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Apply a gear template to ${ids.length}`}
      footer={
        <div className="flex flex-wrap gap-3">
          {current ? (
            <Button loading={pending} onClick={apply} disabled={current.add + current.remove === 0}>
              Apply
            </Button>
          ) : (
            <Button loading={pending} onClick={check}>
              Preview changes
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field id="ts-tpl" label="Template">
          <Select id="ts-tpl" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="auto">Match each athlete&apos;s position</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Checkbox id="ts-replace" checked={replace} onChange={(e) => setReplace(e.target.checked)} label="Also remove items that aren't in the template" hint="Items that already have gifts are never removed." />
        <p role="status" aria-live="polite" className="t-body">
          {current &&
            (current.add + current.remove === 0
              ? 'Nothing to change. These athletes already match the template.'
              : `Adds ${current.add} and removes ${current.remove} items across ${current.athletes} athletes.`)}
        </p>
      </div>
    </Sheet>
  );
}
