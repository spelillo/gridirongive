export interface BuyNeed {
  id: string;
  name: string;
  variant: string | null;
  raised_cents: number;
  price_cents: number;
  athlete_name: string;
}

export interface BuyGroup {
  name: string;
  count: number;
  sizes: { size: string; count: number }[];
  availableCents: number;
  needs: BuyNeed[];
}

/** "Helmet × 6: L ×3, M ×2, XL ×1 · $1,800 available" (ui-ux-spec 8.9). */
export function groupBuyList(needs: BuyNeed[]): BuyGroup[] {
  const groups = new Map<string, BuyGroup>();
  for (const n of needs) {
    const g = groups.get(n.name) ?? { name: n.name, count: 0, sizes: [], availableCents: 0, needs: [] };
    g.count += 1;
    g.availableCents += n.raised_cents;
    g.needs.push(n);
    const size = n.variant?.trim() || 'No size';
    const s = g.sizes.find((x) => x.size === size);
    if (s) s.count += 1;
    else g.sizes.push({ size, count: 1 });
    groups.set(n.name, g);
  }
  const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  for (const g of groups.values()) {
    g.sizes.sort((a, b) => {
      const ia = order.indexOf(a.size);
      const ib = order.indexOf(b.size);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.size.localeCompare(b.size);
    });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null || v === undefined ? '' : String(v);
          // Neutralize spreadsheet formulas in exported user text. Numbers
          // (a refund of -2500 cents, say) can't carry a formula, so they stay numeric.
          const safe = typeof v === 'string' && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
          return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        })
        .join(','),
    )
    .join('\r\n');
}
