'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, School, Users } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { track } from '@/lib/analytics-client';

interface Suggestion {
  type: 'team' | 'school';
  label: string;
  sub: string;
  href: string;
}

function highlight(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (!q || i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span className="font-medium text-ink">{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </>
  );
}

/**
 * Search field with suggestions: leading magnifier, clear button, up to 8
 * keyboard-navigable suggestions (ui-ux-spec 3). Submits to /search.
 */
export function SearchField({
  size = 'md',
  defaultValue = '',
  autoFocus,
  withSport,
  defaultSport = '',
  sports = [],
  onNavigate,
  label = 'Search teams',
  keepParams,
  showButton,
}: {
  size?: 'lg' | 'md';
  defaultValue?: string;
  autoFocus?: boolean;
  withSport?: boolean;
  defaultSport?: string;
  sports?: { id: string; label: string }[];
  onNavigate?: () => void;
  label?: string;
  /** Filters to carry over when the search is submitted (the /search page keeps its filters). */
  keepParams?: Record<string, string>;
  /** Show a Search button without the sport select. */
  showButton?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState(defaultValue);
  const [sport, setSport] = useState(defaultSport);
  const [fetched, setItems] = useState<Suggestion[]>([]);
  const items = q.trim().length < 2 ? [] : fetched;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const id = ++reqRef.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(term)}`);
        const data = (await res.json()) as { items: Suggestion[] };
        if (id === reqRef.current) {
          setItems(data.items);
          setActive(-1);
        }
      } catch {
        /* suggestions are optional */
      }
    }, 120);
    return () => clearTimeout(t);
  }, [q]);

  const go = (href: string) => {
    setOpen(false);
    onNavigate?.();
    router.push(href);
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (open && active >= 0 && items[active]) return go(items[active].href);
    track('search_submitted', { has_query: q.trim().length > 0, sport: sport || 'all' });
    const params = new URLSearchParams(keepParams);
    params.delete('q');
    if (q.trim()) params.set('q', q.trim());
    if (sport) params.set('sport', sport);
    go(`/search${params.size ? `?${params}` : ''}`);
  };

  const h = size === 'lg' ? 'h-[52px]' : 'h-11';
  const showList = open && items.length > 0;

  return (
    <form role="search" onSubmit={submit} className={cn('flex w-full flex-col gap-3 sm:flex-row', size === 'md' && 'max-w-xl')}>
      <div className="relative min-w-0 flex-1">
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <Search aria-hidden size={20} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-nav" />
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
          autoFocus={autoFocus}
          placeholder="School, team or town"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!showList) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => (a + 1) % items.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className={cn(
            h,
            'w-full rounded-md border border-hairline bg-canvas pl-10 pr-11 text-[16px] text-ink placeholder:text-ink-meta [&::-webkit-search-cancel-button]:hidden',
          )}
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQ('');
              setItems([]);
              inputRef.current?.focus();
            }}
            className="absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center text-ink-nav hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        )}
        {showList && (
          <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-hairline-soft bg-canvas shadow-pop">
            {items.map((it, i) => (
              <li
                key={`${it.type}-${it.href}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(it.href);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn('flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2', i === active && 'bg-band-blue')}
              >
                {it.type === 'team' ? <Users aria-hidden size={18} className="shrink-0 text-ink-nav" /> : <School aria-hidden size={18} className="shrink-0 text-ink-nav" />}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] text-ink-list">{highlight(it.label, q.trim())}</span>
                  <span className="truncate text-[13px] text-ink-meta">{it.sub}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {showButton && !withSport && (
        <button type="submit" className={cn(h, 'shrink-0 rounded-md bg-primary px-5 font-medium text-on-primary hover:bg-primary-deep')}>
          Search
        </button>
      )}
      {withSport && (
        <div className="flex gap-3">
          <label htmlFor={`${inputId}-sport`} className="sr-only">
            Sport
          </label>
          <select
            id={`${inputId}-sport`}
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className={cn(h, 'min-w-0 flex-1 rounded-md border border-hairline bg-canvas px-3 text-[16px] text-ink sm:flex-none')}
          >
            <option value="">All sports</option>
            {sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="submit" className={cn(h, 'shrink-0 rounded-md bg-primary px-5 font-medium text-on-primary hover:bg-primary-deep')}>
            Search
          </button>
        </div>
      )}
    </form>
  );
}
