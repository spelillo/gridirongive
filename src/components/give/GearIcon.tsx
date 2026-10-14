import { Dumbbell, Footprints, Hand, HardHat, HeartHandshake, Shield, Shirt } from 'lucide-react';

/** Catalog thumbnail stand-in: one icon per category, never a stock photo. */
export function GearIcon({ name, category, size = 22, className }: { name?: string; category?: string | null; size?: number; className?: string }) {
  const n = (name ?? '').toLowerCase();
  const Icon =
    category === 'team_fund' ? HeartHandshake
    : n.includes('helmet') ? HardHat
    : category === 'Footwear' || n.includes('cleat') || n.includes('skate') ? Footprints
    : category === 'Apparel' || n.includes('jersey') || n.includes('pants') ? Shirt
    : n.includes('glove') ? Hand
    : category === 'Team equipment' ? Dumbbell
    : Shield;
  return <Icon aria-hidden size={size} strokeWidth={1.75} className={className} />;
}
