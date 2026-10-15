'use client';
import { GiveButton, useGive } from '@/components/give/GiveProvider';
import { GearArt } from '@/components/gear/GearArt';
import { Meter } from '@/components/ui/Meter';
import { NeedStatusChip } from '@/components/ui/Chip';
import { moneyWhole } from '@/lib/domain/money';
import { needLeft } from '@/components/give/types';

/** Team fund row and shared team needs (sled, practice jerseys). Visible without the code. */
export function TeamNeeds() {
  const { config } = useGive();
  const teamNeeds = config.needs.filter((n) => n.kind === 'team');
  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <GearArt name="Team fund" category="team_fund" size={44} />
          <div>
            <p className="text-[16px] font-semibold text-ink">Team fund</p>
            <p className="t-caption">Goes where it&apos;s needed most</p>
          </div>
        </div>
        <GiveButton target={{ kind: 'team_fund' }} variant="secondary" full>
          Give to team fund
        </GiveButton>
      </div>
      {teamNeeds.map((n) => {
        const left = needLeft(n);
        return (
          <div key={n.id} className="card flex flex-col gap-3 p-4">
            <div className="flex items-start gap-3">
              <GearArt name={n.name} category={n.category} size={44} />
              <div className="min-w-0 flex-1">
                <h3 className="text-[16px] leading-6 font-semibold text-ink">{n.name}</h3>
                {n.variant && <p className="t-caption">{n.variant}</p>}
              </div>
              {left === 0 ? <NeedStatusChip status={n.status} /> : <span className="t-caption tabular whitespace-nowrap">{moneyWhole(left)} left</span>}
            </div>
            <Meter raised={n.raisedCents} goal={n.priceCents ?? 0} compact />
            {left > 0 && (
              <GiveButton target={{ kind: 'need', needId: n.id, entry: 'card' }} variant="secondary" full>
                Give to {n.name}
              </GiveButton>
            )}
          </div>
        );
      })}
    </div>
  );
}
