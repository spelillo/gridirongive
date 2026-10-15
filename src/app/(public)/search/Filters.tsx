'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select } from '@/components/ui/Field';
import { cn } from '@/components/ui/cn';
import { appliedCount, type FilterValues } from './values';

interface Options {
  sports: readonly { id: string; label: string }[];
  levels: readonly { id: string; label: string }[];
  states: readonly string[];
}

const SORTS = [
  { id: 'relevance', label: 'Relevance' },
  { id: 'nearest', label: 'Nearest' },
  { id: 'needed', label: 'Most needed' },
  { id: 'recent', label: 'Recently active' },
];

/**
 * A plain GET form, so filters work without JavaScript and the URL always
 * reflects them. On wide screens a change submits right away.
 */
function FiltersForm({ values, options, idPrefix, layout, autoSubmit, onSubmitted }: { values: FilterValues; options: Options; idPrefix: string; layout: 'row' | 'stack'; autoSubmit?: boolean; onSubmitted?: () => void }) {
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [zip, setZip] = useState(values.zip);
  // With JavaScript, build a clean URL (no empty or default values). Without it, the GET form still works.
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const p = new URLSearchParams();
    for (const k of ['q', 'sport', 'level', 'state', 'zip']) {
      const v = String(fd.get(k) ?? '').trim();
      if (v) p.set(k, v);
    }
    const sort = String(fd.get('sort') ?? '');
    if (sort && sort !== 'relevance') p.set('sort', sort);
    if (!fd.getAll('open').includes('1')) p.set('open', '0');
    onSubmitted?.();
    router.push(`/search${p.size ? `?${p}` : ''}`, { scroll: false });
  };
  const submit = () => {
    if (autoSubmit) ref.current?.requestSubmit();
  };
  const id = (k: string) => `${idPrefix}-${k}`;
  const label = 't-label';
  const cell = layout === 'row' ? 'flex min-w-0 flex-col gap-1.5' : 'flex flex-col gap-1.5';
  return (
    <form ref={ref} action="/search" method="get" onSubmit={onSubmit} className={cn(layout === 'row' ? 'grid grid-cols-[repeat(5,minmax(0,1fr))_auto] items-end gap-3' : 'flex flex-col gap-4')}>
      {values.q && <input type="hidden" name="q" value={values.q} />}
      <div className={cell}>
        <label htmlFor={id('sport')} className={label}>
          Sport
        </label>
        <Select id={id('sport')} name="sport" defaultValue={values.sport} onChange={submit}>
          <option value="">All sports</option>
          {options.sports.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <div className={cell}>
        <label htmlFor={id('level')} className={label}>
          Level
        </label>
        <Select id={id('level')} name="level" defaultValue={values.level} onChange={submit}>
          <option value="">All levels</option>
          {options.levels.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <div className={cell}>
        <label htmlFor={id('state')} className={label}>
          State
        </label>
        <Select id={id('state')} name="state" defaultValue={values.state} onChange={submit}>
          <option value="">All states</option>
          {options.states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>
      <div className={cell}>
        <label htmlFor={id('zip')} className={label}>
          Near ZIP
        </label>
        <Input
          id={id('zip')}
          name="zip"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          pattern="[0-9]{5}"
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
          onBlur={() => {
            if (zip !== values.zip && (zip.length === 5 || zip.length === 0)) submit();
          }}
          className="tabular"
        />
      </div>
      <div className={cell}>
        <label htmlFor={id('sort')} className={label}>
          Sort by
        </label>
        <Select id={id('sort')} name="sort" defaultValue={values.sort} onChange={submit}>
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <div className={cn(layout === 'row' ? 'flex items-end gap-3' : 'flex flex-col gap-4')}>
        {/* The hidden 0 is sent when the box is unchecked, so "off" survives in the URL. */}
        <input type="hidden" name="open" value="0" />
        <Checkbox id={id('open')} name="open" value="1" defaultChecked={values.open} label="Has open needs" onChange={submit} className="whitespace-nowrap" />
        <Button type="submit" variant={layout === 'row' ? 'secondary' : 'primary'} full={layout === 'stack'}>
          Apply
        </Button>
      </div>
    </form>
  );
}

export function SearchFilters({ values, options }: { values: FilterValues; options: Options }) {
  const [open, setOpen] = useState(false);
  const count = appliedCount(values);
  const clearHref = values.q ? `/search?q=${encodeURIComponent(values.q)}` : '/search';
  return (
    <>
      <div className="hidden flex-col gap-2 lg:flex">
        <FiltersForm key={JSON.stringify(values)} values={values} options={options} idPrefix="f" layout="row" autoSubmit />
        {count > 0 && (
          <Link href={clearHref} className="inline-flex min-h-9 items-center self-start text-[15px]">
            Clear filters
          </Link>
        )}
      </div>
      <div className="flex items-center gap-4 lg:hidden">
        <Button variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <SlidersHorizontal aria-hidden size={18} strokeWidth={1.75} />
          Filters{count > 0 ? ` (${count})` : ''}
        </Button>
        {count > 0 && (
          <Link href={clearHref} className="inline-flex min-h-11 items-center text-[15px]">
            Clear filters
          </Link>
        )}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Filters">
        {open && <FiltersForm values={values} options={options} idPrefix="fm" layout="stack" onSubmitted={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}
