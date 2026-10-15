'use client';
import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea, Checkbox } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Banner';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { saveCatalogItem, type CatalogInput } from '@/lib/app/admin-actions';

export interface CatalogItem {
  id: string;
  sport: string;
  category: string;
  name: string;
  description: string | null;
  price_min_cents: number;
  price_max_cents: number;
  default_price_cents: number;
  safety_note: string | null;
  sizes: string[];
  positions: string[];
  active: boolean;
  sort: number;
}

const dollars = (c: number) => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));

function toInput(item: CatalogItem | null, sport: string): CatalogInput {
  return item
    ? {
        id: item.id,
        sport: item.sport,
        category: item.category,
        name: item.name,
        description: item.description ?? '',
        priceMin: dollars(item.price_min_cents),
        priceMax: dollars(item.price_max_cents),
        priceDefault: dollars(item.default_price_cents),
        safetyNote: item.safety_note ?? '',
        sizes: item.sizes.join(', '),
        positions: item.positions.join(', '),
        active: item.active,
        sort: String(item.sort),
      }
    : { id: null, sport, category: '', name: '', description: '', priceMin: '', priceMax: '', priceDefault: '', safetyNote: '', sizes: '', positions: '', active: true, sort: '0' };
}

/** Edit or add one catalog item in a sheet. */
export function CatalogItemButton({ item, sport, categories }: { item: CatalogItem | null; sport: string; categories: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const uid = useId().replace(/:/g, '');
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<CatalogInput>(() => toInput(item, sport));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof CatalogInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));
  const id = (k: string) => `${uid}-${k}`;
  const show = () => {
    setV(toInput(item, sport));
    setError(null);
    setOpen(true);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const r = await saveCatalogItem(v);
      if (!r.ok) return setError(r.error);
      toast(r.message ?? 'Saved');
      setOpen(false);
      router.refresh();
    });
  };
  return (
    <>
      {item ? (
        <Button variant="secondary" size="sm" onClick={show} aria-label={`Edit ${item.name}`}>
          Edit
        </Button>
      ) : (
        <Button onClick={show}>
          <Plus size={18} aria-hidden /> Add item
        </Button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} locked={pending} title={item ? `Edit ${item.name}` : `Add a ${sport} item`} size="lg">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {error && <Banner tone="error">{error}</Banner>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={id('name')} label="Name" required>
              <Input id={id('name')} value={v.name} onChange={set('name')} maxLength={80} required />
            </Field>
            <Field id={id('category')} label="Category" required helper="Pick one in use or type a new one.">
              <Input id={id('category')} value={v.category} onChange={set('category')} list={id('cats')} maxLength={40} required aria-describedby={`${id('category')}-help`} />
              <datalist id={id('cats')}>
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </div>
          {!item && (
            <Field id={id('sport')} label="Sport" required helper="Lowercase, like football.">
              <Input id={id('sport')} value={v.sport} onChange={set('sport')} maxLength={30} aria-describedby={`${id('sport')}-help`} />
            </Field>
          )}
          <Field id={id('desc')} label="Description" optional>
            <Input id={id('desc')} value={v.description} onChange={set('description')} maxLength={300} />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="t-label mb-1">Price range in dollars</legend>
            <div className="grid grid-cols-3 gap-3">
              <Field id={id('min')} label="Lowest" required>
                <Input id={id('min')} value={v.priceMin} onChange={set('priceMin')} inputMode="decimal" />
              </Field>
              <Field id={id('def')} label="Default" required>
                <Input id={id('def')} value={v.priceDefault} onChange={set('priceDefault')} inputMode="decimal" />
              </Field>
              <Field id={id('max')} label="Highest" required>
                <Input id={id('max')} value={v.priceMax} onChange={set('priceMax')} inputMode="decimal" />
              </Field>
            </div>
            <p className="t-caption">Coaches can set a price inside this range. The default must be inside it.</p>
          </fieldset>
          <Field id={id('safety')} label="Safety note" optional helper="Shown to coaches and on the gear card, like a certification rule.">
            <Textarea id={id('safety')} value={v.safetyNote} onChange={set('safetyNote')} rows={2} maxLength={300} className="min-h-20" aria-describedby={`${id('safety')}-help`} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={id('sizes')} label="Sizes" optional helper="Comma separated, like S, M, L.">
              <Input id={id('sizes')} value={v.sizes} onChange={set('sizes')} aria-describedby={`${id('sizes')}-help`} />
            </Field>
            <Field id={id('pos')} label="Position presets" optional helper="Comma separated, like QB, RB. Empty means every position.">
              <Input id={id('pos')} value={v.positions} onChange={set('positions')} aria-describedby={`${id('pos')}-help`} />
            </Field>
          </div>
          <div className="grid items-end gap-4 sm:grid-cols-2">
            <Field id={id('sort')} label="Sort order" helper="Lower numbers come first.">
              <Input id={id('sort')} value={v.sort} onChange={set('sort')} inputMode="numeric" aria-describedby={`${id('sort')}-help`} />
            </Field>
            <Checkbox id={id('active')} checked={v.active} onChange={set('active')} label="Active" hint="Inactive items can't be added to new gear lists." />
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-hairline-soft pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} loadingLabel="Saving">
              {item ? 'Save' : 'Add item'}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
