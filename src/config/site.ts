export const SITE = {
  name: 'Gridiron Give',
  supportEmail: process.env.SUPPORT_EMAIL ?? 'support@gridirongive.com',
  /**
   * Receipts only describe a gift as tax deductible when this is on AND the
   * team's organization is marked tax exempt with an EIN. Off by default
   * because there is no nonprofit or fiscal sponsor yet.
   */
  taxDeductibleReceipts: process.env.RECEIPTS_TAX_DEDUCTIBLE === 'true',
  consentPolicyVersion: '2026-10',
  sports: [
    { id: 'football', label: 'Football' },
    { id: 'hockey', label: 'Hockey' },
    { id: 'lacrosse', label: 'Lacrosse' },
    { id: 'baseball', label: 'Baseball' },
  ],
  levels: [
    { id: 'varsity', label: 'Varsity' },
    { id: 'jv', label: 'JV' },
    { id: 'freshman', label: 'Freshman' },
    { id: 'youth', label: 'Youth' },
    { id: 'club', label: 'Club' },
  ],
} as const;

export const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN',
  'MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY',
] as const;
