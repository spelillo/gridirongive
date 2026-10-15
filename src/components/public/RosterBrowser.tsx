'use client';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { RosterTile } from '@/lib/queries/public';
import { AthleteTile } from './AthleteTile';
import { Checkbox } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { percentFunded } from '@/lib/domain/money';

type Group = 'all' | 'offense' | 'defense' | 'special';
type Sort = 'needed' | 'number' | 'name';

/** Roster controls and tiles (ui-ux-spec 5.3, unlocked state). */
export function RosterBrowser({ tiles, teamSlug, sport }: { tiles: RosterTile[]; teamSlug: string; sport: string }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<Group>('all');
  const [needs, setNeeds] = useState(true);
  const [sort, setSort] = useState<Sort>('needed');

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = tiles.filter((t) => {
      if (term && !`${t.display_name} ${t.jersey ?? ''} ${t.position ?? ''}`.toLowerCase().includes(term)) return false;
      if (group !== 'all' && t.position_group !== group) return false;
      if (needs && t.goal_cents > 0 && t.raised_cents >= t.goal_cents) return false;
      return true;
    });
    const funded = (t: RosterTile) => (t.goal_cents > 0 && t.raised_cents >= t.goal_cents ? 1 : 0);
    return list.sort((a, b) => {
      const f = funded(a) - funded(b);
      if (f) return f;
      if (sort === 'number') return (parseInt(a.jersey ?? '999', 10) || 999) - (parseInt(b.jersey ?? '999', 10) || 999);
      if (sort === 'name') return a.display_name.localeCompare(b.display_name);
      return percentFunded(a.raised_cents, a.goal_cents) - percentFunded(b.raised_cents, b.goal_cents) || a.display_name.localeCompare(b.display_name);
    });
  }, [tiles, q, group, needs, sort]);

  const ctl = 'h-11 rounded-[10px] border border-hairline bg-canvas px-3 text-[16px] text-ink focus:border-primary focus:shadow-[0_0_0_4px_rgba(23,71,209,0.22)] focus:outline-none';
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="relative lg:w-72">
          <label htmlFor="roster-q" className="sr-only">
            Search players by first name, number or position
          </label>
          <Search aria-hidden size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-nav" />
          <input id="roster-q" type="search" placeholder="Name, number or position" value={q} onChange={(e) => setQ(e.target.value)} className={`${ctl} w-full pl-9`} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          {sport === 'football' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="roster-group" className="t-caption">
                Position
              </label>
              <select id="roster-group" value={group} onChange={(e) => setGroup(e.target.value as Group)} className={ctl}>
                <option value="all">All positions</option>
                <option value="offense">Offense</option>
                <option value="defense">Defense</option>
                <option value="special">Special teams</option>
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="roster-sort" className="t-caption">
              Sort
            </label>
            <select id="roster-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={ctl}>
              <option value="needed">Most needed</option>
              <option value="number">Number</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>
        <Checkbox id="roster-needs" checked={needs} onChange={(e) => setNeeds(e.target.checked)} label="Still needs gear" className="lg:ml-2" />
      </div>
      <p className="t-caption" aria-live="polite">
        Showing {shown.length} of {tiles.length} players
      </p>
      {shown.length === 0 ? (
        <EmptyState
          action={
            <button type="button" className="min-h-11 rounded-[10px] border border-[#cfd6e1] bg-canvas px-4 font-semibold text-ink hover:bg-chrome" onClick={() => { setQ(''); setGroup('all'); setNeeds(false); }}>
              Show all players
            </button>
          }
        >
          {tiles.length === 0 ? 'No player pages are live yet.' : 'No players match these filters.'}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          {shown.map((t) => (
            <AthleteTile key={t.id} a={t} teamSlug={teamSlug} />
          ))}
        </ul>
      )}
    </div>
  );
}
