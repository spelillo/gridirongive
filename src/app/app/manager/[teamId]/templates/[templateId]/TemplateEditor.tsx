'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Info } from 'lucide-react';
import { Section } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Checkbox, Fieldset } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Banner';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { applyTemplate, deleteTemplate, saveTemplate, setDefaultTemplate, type ApplyTarget } from '@/lib/app/team-actions';
import { moneyWhole, parseDollarsToCents } from '@/lib/domain/money';
import { cn } from '@/components/ui/cn';

interface CatalogItem {
  id: string;
  name: string;
  category: string;
  description: string | null;
  sizes: string[];
  safetyNote: string | null;
  defaultCents: number;
  minCents: number;
  maxCents: number;
}
interface Item {
  catalogId: string;
  size: string | null;
  price: string;
}

const POSITIONS = ['QB', 'RB', 'FB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'DB', 'K', 'P', 'LS'];

export function TemplateEditor({
  teamId,
  templateId,
  isDefault,
  canEdit,
  initial,
  catalog,
  roster,
}: {
  teamId: string;
  templateId: string | null;
  isDefault: boolean;
  canEdit: boolean;
  initial: { name: string; positions: string[]; items: { catalogId: string; size: string | null; priceCents: number }[] };
  catalog: CatalogItem[];
  roster: { id: string; name: string; jersey: string | null; position: string | null }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(initial.name);
  const [positions, setPositions] = useState<string[]>(initial.positions);
  const [items, setItems] = useState<Item[]>(initial.items.map((i) => ({ catalogId: i.catalogId, size: i.size, price: (i.priceCents / 100).toFixed(2) })));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const included = new Set(items.map((i) => i.catalogId));
  const dirty = JSON.stringify({ name, positions, items }) !== JSON.stringify({ name: initial.name, positions: initial.positions, items: initial.items.map((i) => ({ catalogId: i.catalogId, size: i.size, price: (i.priceCents / 100).toFixed(2) })) });
  const total = items.reduce((s, i) => s + (parseDollarsToCents(i.price) ?? 0), 0);
  const groups = [...new Set(catalog.map((c) => c.category))];

  const toggle = (c: CatalogItem, on: boolean) =>
    setItems((xs) => (on ? [...xs, { catalogId: c.id, size: null, price: (c.defaultCents / 100).toFixed(2) }] : xs.filter((x) => x.catalogId !== c.id)));
  const patch = (id: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.catalogId === id ? { ...x, ...p } : x)));
  const move = (idx: number, d: -1 | 1) =>
    setItems((xs) => {
      const n = [...xs];
      const j = idx + d;
      if (j < 0 || j >= n.length) return xs;
      [n[idx], n[j]] = [n[j], n[idx]];
      return n;
    });

  const save = () =>
    start(async () => {
      const parsed = items.map((i) => ({ catalogId: i.catalogId, size: i.size, priceCents: parseDollarsToCents(i.price) ?? -1 }));
      const bad = parsed.find((p) => {
        const c = byId.get(p.catalogId)!;
        return p.priceCents < c.minCents || p.priceCents > c.maxCents;
      });
      if (bad) {
        const c = byId.get(bad.catalogId)!;
        setError(`Keep ${c.name} between ${moneyWhole(c.minCents)} and ${moneyWhole(c.maxCents)}.`);
        return;
      }
      const r = await saveTemplate(teamId, templateId, { name, positions, items: parsed });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError(null);
      toast('Template saved');
      if (!templateId && r.data) router.replace(`/app/manager/${teamId}/templates/${r.data.id}`);
      else router.refresh();
    });

  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="tpl-name" label="Template name" required>
              <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={!canEdit} />
            </Field>
          </div>
          <Fieldset legend="Used automatically for these positions" hint="Leave all off for a general template.">
            <div className="flex flex-wrap gap-2">
              {POSITIONS.map((p) => {
                const on = positions.includes(p);
                return (
                  <label key={p} className={cn('flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border px-3 text-[15px]', on ? 'border-primary bg-band-blue font-medium text-primary-deep' : 'border-hairline-soft')}>
                    <input type="checkbox" className="sr-only" checked={on} disabled={!canEdit} onChange={() => setPositions((ps) => (on ? ps.filter((x) => x !== p) : [...ps, p]))} />
                    {p}
                  </label>
                );
              })}
            </div>
          </Fieldset>

          <section aria-labelledby="inc-h" className="flex flex-col gap-3">
            <h2 id="inc-h" className="t-subhead">
              Items <span className="t-caption font-normal">· {items.length} · {moneyWhole(total)} per athlete</span>
            </h2>
            {items.length === 0 && <p className="t-body">Turn on items from the catalog below.</p>}
            <ol className="flex flex-col gap-2">
              {items.map((i, idx) => {
                const c = byId.get(i.catalogId);
                if (!c) return null;
                const cents = parseDollarsToCents(i.price);
                const out = cents === null || cents < c.minCents || cents > c.maxCents;
                return (
                  <li key={i.catalogId} className="flex flex-wrap items-end gap-3 rounded-md border border-hairline-soft p-3">
                    <div className="min-w-[160px] flex-1">
                      <p className="text-[15px] font-medium text-ink">{c.name}</p>
                      <p className="t-caption">
                        {moneyWhole(c.minCents)} to {moneyWhole(c.maxCents)}
                      </p>
                    </div>
                    <Field id={`p-${c.id}`} label="Price" className="w-32" error={out ? 'Out of range' : null}>
                      <Input id={`p-${c.id}`} inputMode="decimal" value={i.price} disabled={!canEdit} onChange={(e) => patch(c.id, { price: e.target.value })} aria-invalid={out} />
                    </Field>
                    {c.sizes.length > 0 && (
                      <Field id={`s-${c.id}`} label="Default size" className="w-32">
                        <Select id={`s-${c.id}`} value={i.size ?? ''} disabled={!canEdit} onChange={(e) => patch(c.id, { size: e.target.value || null })}>
                          <option value="">Not set</option>
                          {c.sizes.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}
                    {canEdit && (
                      <div className="flex gap-2">
                        <button type="button" aria-label={`Move ${c.name} up`} disabled={idx === 0} onClick={() => move(idx, -1)} className="flex size-11 items-center justify-center rounded-md border border-hairline-soft hover:bg-band disabled:opacity-40">
                          <ArrowUp size={18} aria-hidden />
                        </button>
                        <button type="button" aria-label={`Move ${c.name} down`} disabled={idx === items.length - 1} onClick={() => move(idx, 1)} className="flex size-11 items-center justify-center rounded-md border border-hairline-soft hover:bg-band disabled:opacity-40">
                          <ArrowDown size={18} aria-hidden />
                        </button>
                        <Button size="sm" variant="tertiary" onClick={() => toggle(c, false)}>
                          Remove
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          {canEdit && (
            <div className="sticky bottom-16 z-10 flex flex-wrap items-center gap-3 border-t border-hairline-soft bg-canvas py-3 lg:bottom-0">
              <Button loading={pending} disabled={!dirty && Boolean(templateId)} onClick={save}>
                {templateId ? 'Save template' : 'Create template'}
              </Button>
              {templateId && !isDefault && (
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await setDefaultTemplate(teamId, templateId);
                      toast(r.ok ? 'Default template set' : r.error);
                      router.refresh();
                    })
                  }
                >
                  Make default
                </Button>
              )}
              {templateId && (
                <Button variant="tertiary" onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              )}
              {dirty && templateId && <span className="t-caption">Unsaved changes</span>}
              {error && (
                <p role="alert" className="w-full text-[14px] text-error">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        <aside aria-labelledby="cat-h" className="flex flex-col gap-3">
          <h2 id="cat-h" className="t-subhead">
            Catalog
          </h2>
          {groups.map((g) => (
            <div key={g} className="flex flex-col gap-1">
              <h3 className="t-label text-ink-meta">{g}</h3>
              <ul className="flex flex-col">
                {catalog
                  .filter((c) => c.category === g)
                  .map((c) => (
                    <li key={c.id} className="border-b border-hairline-soft py-2">
                      <Checkbox
                        id={`cat-${c.id}`}
                        checked={included.has(c.id)}
                        disabled={!canEdit}
                        onChange={(e) => toggle(c, e.target.checked)}
                        label={c.name}
                        hint={
                          <>
                            {moneyWhole(c.minCents)} to {moneyWhole(c.maxCents)}
                            {c.description ? ` · ${c.description}` : ''}
                            {c.safetyNote && (
                              <span className="mt-1 flex items-start gap-1 text-warn">
                                <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
                                {c.safetyNote}
                              </span>
                            )}
                          </>
                        }
                      />
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </aside>
      </div>

      {templateId && canEdit && <ApplyPanel teamId={teamId} templateId={templateId} positions={positions} roster={roster} dirty={dirty} />}

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this template?"
        footer={
          <div className="flex gap-3">
            <Button
              variant="destructive"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const r = await deleteTemplate(teamId, templateId!);
                  toast(r.ok ? 'Template deleted' : r.error);
                  if (r.ok) router.push(`/app/manager/${teamId}/templates`);
                  setConfirmDelete(false);
                })
              }
            >
              Delete
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        }
      >
        <p className="t-body">Athletes keep the gear they already have. Only the template goes away.</p>
      </Sheet>
    </div>
  );
}

function ApplyPanel({ teamId, templateId, positions, roster, dirty }: { teamId: string; templateId: string; positions: string[]; roster: { id: string; name: string; jersey: string | null; position: string | null }[]; dirty: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [kind, setKind] = useState<'all' | 'positions' | 'selected'>(positions.length ? 'positions' : 'all');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [replace, setReplace] = useState(false);
  const [preview, setPreview] = useState<{ key: string; add: number; remove: number; athletes: number } | null>(null);
  const [pending, start] = useTransition();
  const target: ApplyTarget = kind === 'all' ? { kind: 'all' } : kind === 'positions' ? { kind: 'positions', positions } : { kind: 'selected', ids: [...chosen] };
  const key = JSON.stringify([target, replace]);
  const cur = preview?.key === key ? preview : null;
  return (
    <Section title="Apply to athletes" id="apply">
      {dirty && <Banner tone="warn" rounded>Save the template first. Applying uses the saved version.</Banner>}
      <Fieldset legend="Which athletes">
        <div className="flex flex-col gap-2">
          {(
            [
              ['all', `Everyone on the roster (${roster.length})`],
              ['positions', positions.length ? `Positions ${positions.join(', ')} (${roster.filter((r) => r.position && positions.includes(r.position)).length})` : 'By position (set positions above first)'],
              ['selected', 'Choose athletes'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex min-h-11 items-center gap-3 text-[15px]">
              <input type="radio" name="apply-kind" className="size-5 accent-primary" checked={kind === k} disabled={k === 'positions' && !positions.length} onChange={() => setKind(k)} />
              {label}
            </label>
          ))}
        </div>
      </Fieldset>
      {kind === 'selected' && (
        <ul className="grid max-h-72 gap-1 overflow-y-auto rounded-md border border-hairline-soft p-2 sm:grid-cols-2 lg:grid-cols-3">
          {roster.map((r) => (
            <li key={r.id}>
              <label className="flex min-h-11 items-center gap-2 px-2 text-[15px]">
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={chosen.has(r.id)}
                  onChange={() =>
                    setChosen((s) => {
                      const n = new Set(s);
                      if (n.has(r.id)) n.delete(r.id);
                      else n.add(r.id);
                      return n;
                    })
                  }
                />
                {r.name}
                {r.jersey && <span className="text-ink-meta">#{r.jersey}</span>}
                {r.position && <span className="text-ink-meta">{r.position}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      <Checkbox id="apply-replace" checked={replace} onChange={(e) => setReplace(e.target.checked)} label="Also remove items that aren't in this template" hint="Items that already have gifts, or were bought, are never removed." />
      <p role="status" aria-live="polite" className="t-body">
        {cur && (cur.add + cur.remove === 0 ? 'Nothing to change.' : `Adds ${cur.add} and removes ${cur.remove} items across ${cur.athletes} athletes.`)}
      </p>
      <div className="flex gap-3">
        {cur ? (
          <Button
            loading={pending}
            disabled={dirty || cur.add + cur.remove === 0}
            onClick={() =>
              start(async () => {
                const r = await applyTemplate(teamId, templateId, target, { replace, dryRun: false });
                toast(r.ok ? (r.message ?? 'Applied') : r.error);
                setPreview(null);
                router.refresh();
              })
            }
          >
            Apply
          </Button>
        ) : (
          <Button
            variant="secondary"
            loading={pending}
            disabled={dirty || (kind === 'selected' && chosen.size === 0)}
            onClick={() =>
              start(async () => {
                const r = await applyTemplate(teamId, templateId, target, { replace, dryRun: true });
                if (r.ok && r.data) setPreview({ key, ...r.data });
                else if (!r.ok) toast(r.error);
              })
            }
          >
            Preview changes
          </Button>
        )}
      </div>
    </Section>
  );
}
