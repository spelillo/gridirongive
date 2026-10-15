import { describe, it, expect } from 'vitest';
import { groupBuyList, toCsv, type BuyNeed } from '@/lib/domain/buylist';

let seq = 0;
const n = (name: string, variant: string | null, raised = 10_000, athlete = 'Jayden S.'): BuyNeed => ({
  id: `n${++seq}`, name, variant, raised_cents: raised, price_cents: raised, athlete_name: athlete,
});

describe('groupBuyList', () => {
  it('groups by item with counts, sizes and money available', () => {
    const groups = groupBuyList([
      n('Helmet', 'L', 30_000), n('Helmet', 'M', 30_000), n('Helmet', 'L', 30_000), n('Helmet', 'XL', 30_000),
      n('Helmet', 'M', 30_000), n('Helmet', 'L', 30_000), n('Cleats', 'Adult 10', 9_000),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Helmet', 'Cleats']);
    const helmet = groups[0];
    expect(helmet.count).toBe(6);
    expect(helmet.availableCents).toBe(180_000);
    expect(helmet.sizes).toEqual([{ size: 'M', count: 2 }, { size: 'L', count: 3 }, { size: 'XL', count: 1 }]);
    expect(helmet.needs).toHaveLength(6);
  });

  it('orders standard sizes first, then others alphabetically, and labels blanks', () => {
    const [g] = groupBuyList([n('Gloves', 'Youth L'), n('Gloves', 'XXL'), n('Gloves', null), n('Gloves', '  '), n('Gloves', 'XS'), n('Gloves', 'Adult M'), n('Gloves', 'S')]);
    expect(g.sizes).toEqual([
      { size: 'XS', count: 1 }, { size: 'S', count: 1 }, { size: 'XXL', count: 1 },
      { size: 'Adult M', count: 1 }, { size: 'No size', count: 2 }, { size: 'Youth L', count: 1 },
    ]);
  });

  it('trims sizes before grouping', () => {
    const [g] = groupBuyList([n('Girdle', ' L '), n('Girdle', 'L')]);
    expect(g.sizes).toEqual([{ size: 'L', count: 2 }]);
  });

  it('sorts groups by count then name', () => {
    const groups = groupBuyList([n('Mouthguard', null), n('Cleats', '9'), n('Belt', null), n('Cleats', '10')]);
    expect(groups.map((g) => [g.name, g.count])).toEqual([['Cleats', 2], ['Belt', 1], ['Mouthguard', 1]]);
  });

  it('returns nothing for no needs', () => {
    expect(groupBuyList([])).toEqual([]);
  });
});

describe('toCsv', () => {
  it('joins rows with CRLF and blanks null and undefined', () => {
    expect(toCsv([['Item', 'Count'], ['Helmet', 6], [null, undefined]])).toBe('Item,Count\r\nHelmet,6\r\n,');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(toCsv([['Pads, shoulder', 'He said "hi"', 'two\nlines', 'cr\ronly']])).toBe('"Pads, shoulder","He said ""hi""","two\nlines","cr\ronly"');
  });

  it('neutralizes spreadsheet formulas in text', () => {
    expect(toCsv([['=SUM(A1:A9)', '+1', '-cmd', '@x', '\tTab']])).toBe("'=SUM(A1:A9),'+1,'-cmd,'@x,'\tTab");
    expect(toCsv([['=HYPERLINK("x","y")']])).toBe(`"'=HYPERLINK(""x"",""y"")"`);
  });

  it('keeps numbers numeric, including negatives', () => {
    expect(toCsv([[-2500, 0, 1.5]])).toBe('-2500,0,1.5');
  });

  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });
});
