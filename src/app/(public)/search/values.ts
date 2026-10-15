export interface FilterValues {
  q: string;
  sport: string;
  level: string;
  state: string;
  zip: string;
  sort: string;
  open: boolean;
}

/** Number of filters that differ from the defaults, shown on the mobile Filters button. */
export function appliedCount(v: FilterValues) {
  return [v.sport, v.level, v.state, v.zip].filter(Boolean).length + (v.open ? 0 : 1);
}
