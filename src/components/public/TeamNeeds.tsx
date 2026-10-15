'use client';
import { GiveButton, useGive } from '@/components/give/GiveProvider';
import { GearIcon } from '@/components/give/GearIcon';
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
      <div className="flex flex-col gap-3 rounded-md border border-hairline-soft p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <GearIcon category="team_fund" className="shrink-0 text-ink-list" />
          <p className="text-[16px] text-ink-body">
            <span className="font-medium text-ink">Team fund:</span> helps where it&apos;s needed most
          </p>
        </div>
        <GiveButton target={{ kind: 'team_fund' }} variant="secondary" className="w-full sm:w-auto">
          Give to team fund
        </GiveButton>
      </div>
      {teamNeeds.length > 0 && (
        <ul className="flex flex-col gap-3">
          {teamNeeds.map((n) => {
            const left = needLeft(n);
            return (
              <li key={n.id} className="flex flex-col gap-3 rounded-md border border-hairline-soft p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <GearIcon name={n.name} category={n.category} className="mt-0.5 shrink-0 text-ink-list" />
                    <div>
                      <h3 className="t-subhead">{n.name}</h3>
                      {n.variant && <p className="t-caption">{n.variant}</p>}
                    </div>
                  </div>
                  {left === 0 ? <NeedStatusChip status={n.status} /> : <span className="t-caption tabular whitespace-nowrap">{moneyWhole(left)} left</span>}
                </div>
                <Meter raised={n.raisedCents} goal={n.priceCents ?? 0} compact />
                {left > 0 && (
                  <GiveButton target={{ kind: 'need', needId: n.id, entry: 'card' }} variant="secondary" className="self-start">
                    Give
                  </GiveButton>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
