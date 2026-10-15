/**
 * Email copy (ui-ux-spec 10.7). Plain, text-forward, one link. Exact numbers.
 * No em dashes, no slogans.
 */
import { money } from '@/lib/domain/money';

export interface EmailContent {
  subject: string;
  body: string;
}

export function magicLinkEmail(link: string, code: string): EmailContent {
  return {
    subject: 'Your Gridiron Give sign-in link',
    body: `Use this link to sign in. It works for 1 hour.\n\nOr enter this code: ${code}\n\nIf you didn't ask for this, you can ignore it.\n\n${link}`,
  };
}

export function inviteEmail(p: { coach: string; athlete: string; team: string; season: string; forGuardian: boolean }): EmailContent {
  return p.forGuardian
    ? {
        subject: `${p.coach} added ${p.athlete} to ${p.team}`,
        body: `${p.coach} added ${p.athlete} to ${p.team} (${p.season}) on Gridiron Give, where supporters can fund ${p.athlete}'s gear.\n\nBefore anything about ${p.athlete} is shown, a parent or guardian needs to review what will be visible and give consent. It takes about 5 minutes.`,
      }
    : {
        subject: `${p.coach} added you to ${p.team}`,
        body: `${p.coach} added you to ${p.team} (${p.season}) on Gridiron Give. Set up your page and pick the gear you need. A parent or guardian will also be asked to give consent.`,
      };
}

export function inviteReminderEmail(p: { athlete: string; team: string; coach: string }): EmailContent {
  return {
    subject: `Reminder: set up ${p.athlete}'s page for ${p.team}`,
    body: `${p.coach} is waiting on ${p.athlete}'s page for ${p.team}. Open the invite to give consent and pick gear.`,
  };
}

export function staffInviteEmail(p: { coach: string; team: string; role: string }): EmailContent {
  return {
    subject: `${p.coach} invited you to help manage ${p.team}`,
    body: `${p.coach} invited you to ${p.team} on Gridiron Give as ${p.role}. Sign in with this email address to get access.`,
  };
}

export function consentConfirmationEmail(p: { athlete: string; team: string; signedName: string; when: string }): EmailContent {
  return {
    subject: `You gave consent for ${p.athlete}'s page`,
    body: `${p.signedName} gave consent on ${p.when} for ${p.athlete}'s page on ${p.team}.\n\nYou can hide the page, delete the photo, or delete the profile at any time from Profile and privacy.`,
  };
}

export function receiptEmail(p: { donor: string; lines: string[]; giftCents: number; feesCents: number; totalCents: number; team: string; last4: string | null; taxNote: string }): EmailContent {
  return {
    subject: `Receipt: ${money(p.totalCents)} to ${p.team}`,
    body: [
      `Thank you, ${p.donor}.`,
      '',
      ...p.lines,
      '',
      `Gift: ${money(p.giftCents)}`,
      `Fees you covered: ${money(p.feesCents)}`,
      `Total charged: ${money(p.totalCents)}${p.last4 ? ` (card ending ${p.last4})` : ''}`,
      '',
      p.taxNote,
      '',
      'What happens next: the coach orders the gear, and you get an email when it is purchased.',
    ].join('\n'),
  };
}

export function newGiftEmail(p: { athlete: string | null; item: string; donor: string; amountCents: number | null; message: string | null }): EmailContent {
  const what = p.athlete ? `${p.item} for ${p.athlete}` : p.item;
  return {
    subject: p.amountCents === null ? `New gift toward ${what}` : `New gift: ${money(p.amountCents)} toward ${what}`,
    body: `${p.donor} gave${p.amountCents === null ? '' : ` ${money(p.amountCents)}`} toward ${what}.${p.message ? `\n\nTheir message: "${p.message}"` : ''}`,
  };
}

export function itemFundedEmail(p: { athlete: string; item: string }): EmailContent {
  return {
    subject: `Fully funded: ${p.athlete}'s ${p.item}`,
    body: `${p.athlete}'s ${p.item} is fully funded. The coach will order it next, and you'll get an email when it's purchased.`,
  };
}

export function purchasedEmail(p: { items: string[]; team: string; vendor: string }): EmailContent {
  return {
    subject: `Purchased: gear you funded for ${p.team}`,
    body: `The coach bought the gear you helped fund from ${p.vendor}:\n\n${p.items.map((i) => `- ${i}`).join('\n')}\n\nThe receipt is on file with the team.`,
  };
}

export function deliveredEmail(p: { items: string[]; team: string; withPhoto?: boolean }): EmailContent {
  return {
    subject: `Delivered: gear you funded for ${p.team}`,
    body: `This gear you helped fund has been handed out:\n\n${p.items.map((i) => `- ${i}`).join('\n')}${p.withPhoto ? '\n\nThe coach added a photo from the hand-out. Open the link to see it.' : ''}`,
  };
}

export function overflowEmail(p: { amountCents: number; team: string }): EmailContent {
  return {
    subject: `Part of your gift went to the ${p.team} team fund`,
    body: `Someone funded part of the same gear while you were paying, so ${money(p.amountCents)} of your gift went to the ${p.team} team fund. The coach uses it where it's needed most. Reply to this email within 30 days if you'd like a refund of that part instead.`,
  };
}

export function thankYouEmail(p: { athlete: string; body: string; team: string }): EmailContent {
  return { subject: `A thank-you from ${p.athlete}`, body: `${p.athlete} (${p.team}) sent you this note:\n\n"${p.body}"` };
}

export function fundsMovedEmail(p: { athlete: string; item: string; team: string; amountCents: number; reason: string }): EmailContent {
  return {
    subject: `Your gift for ${p.athlete} moved to the ${p.team} team fund`,
    body: `${p.reason} The ${money(p.amountCents)} raised for ${p.athlete}'s ${p.item} moved to the ${p.team} team fund, where the coach spends it on gear the team needs. Reply within 30 days if you'd prefer a refund.`,
  };
}

export function seasonSummaryEmail(p: { team: string; season: string; totalCents: number; gifts: number }): EmailContent {
  return {
    subject: `${p.team} ${p.season}: your season summary`,
    body: `The ${p.team} ${p.season} season is closed. You gave ${p.gifts} ${p.gifts === 1 ? 'gift' : 'gifts'} totaling ${money(p.totalCents)}. Thank you.`,
  };
}

export function profileNudgeEmail(p: { athlete: string; team: string; changesRequested: boolean }): EmailContent {
  return p.changesRequested
    ? {
        subject: `${p.athlete}'s page for ${p.team} needs a few changes`,
        body: `The coach asked for changes to ${p.athlete}'s page before it goes live. Supporters can't give to ${p.athlete} until it's updated and sent back.`,
      }
    : {
        subject: `Finish ${p.athlete}'s page for ${p.team}`,
        body: `Consent is done, but ${p.athlete}'s page hasn't been sent to the coach yet. Add a photo and a short note, check the gear list, then send it for review.`,
      };
}

export function weeklyCoachEmail(p: {
  team: string;
  raisedCents: number;
  gifts: number;
  approvals: number;
  toBuy: number;
  notJoined: number;
  availableCents: number;
}): EmailContent {
  const lines = [
    `Last 7 days: ${p.gifts} ${p.gifts === 1 ? 'gift' : 'gifts'}, ${money(p.raisedCents)} raised.`,
    `Available to spend: ${money(p.availableCents)}.`,
  ];
  if (p.approvals) lines.push(`Waiting on your approval: ${p.approvals}.`);
  if (p.toBuy) lines.push(`Funded items to buy: ${p.toBuy}.`);
  if (p.notJoined) lines.push(`Athletes who haven't accepted their invite: ${p.notJoined}.`);
  return { subject: `${p.team}: your week on Gridiron Give`, body: lines.join('\n') };
}

/** One email holding a day's worth of notifications for people who chose the daily digest. */
export function digestEmail(p: { items: { subject: string; body: string; link: string | null }[] }): EmailContent {
  const n = p.items.length;
  return {
    subject: `Your Gridiron Give daily summary: ${n} ${n === 1 ? 'update' : 'updates'}`,
    body: [
      `Here is what happened since your last summary.`,
      '',
      ...p.items.map((i) => [`${i.subject}`, i.body.replace(i.link ?? '\u0000', '').trim(), i.link ?? ''].filter(Boolean).join('\n')),
      '',
      'You get this once a day because you chose the daily digest. Change it in your account settings.',
    ].join('\n\n').replace(/\n{3,}/g, '\n\n'),
  };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function renderEmailHtml(subject: string, text: string, link: string | null): string {
  const paras = escapeHtml(text.replace(link ?? '\u0000', '').trim())
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  const button = link
    ? `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#0057d2;color:#fff;padding:12px 16px;border-radius:8px;text-decoration:none;font-weight:500;display:inline-block">Open Gridiron Give</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f5f6f7;font-family:Inter,Arial,sans-serif;color:#223548">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:16px;font-weight:500;color:#000;margin:0 0 24px">Gridiron Give</p>
<div style="background:#fff;border:1px solid #d9dee3;border-radius:8px;padding:24px;font-size:16px;line-height:24px">
<h1 style="font-size:20px;line-height:24px;font-weight:500;color:#000;margin:0 0 16px">${escapeHtml(subject)}</h1>${paras}${button}</div>
<p style="font-size:13px;color:#475e75;margin:16px 0 0">You're receiving this because of activity on Gridiron Give. Manage email preferences in your account settings.</p>
</div></body></html>`;
}
