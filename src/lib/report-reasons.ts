/** Reasons offered on /report. Shared by the form and the API so labels stay in sync. */
export const REPORT_REASONS = [
  { id: 'personal_info', label: 'Personal information is shown' },
  { id: 'inappropriate', label: 'Inappropriate photo, bio or message' },
  { id: 'not_real', label: "The team or fundraiser doesn't look real" },
  { id: 'remove_player', label: 'A player should not be on this page' },
  { id: 'payment', label: 'A problem with a payment or receipt' },
  { id: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['id'];

export function reportReasonLabel(id: string): string {
  return REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
}
