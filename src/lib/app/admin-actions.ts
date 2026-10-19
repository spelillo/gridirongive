'use server';
import { revalidatePath } from 'next/cache';
import { sys, dbErrorMessage } from '@/lib/db';
import { requireAdmin, type SessionUser } from '@/lib/auth/session';
import { notifyTeamStaff, notifyAthleteFamily, flushSoon } from '@/lib/notify';
import { reverseDonation } from '@/lib/payments/process';
import { stripe, stripeRefundParams } from '@/lib/payments/stripe';
import { cleanUserText } from '@/lib/domain/text';
import { athleteDisplayName } from '@/lib/domain/names';
import { money, parseDollarsToCents } from '@/lib/domain/money';
import { env, mode } from '@/lib/env';
import { broadcastTeam } from '@/lib/realtime';

export type Result = { ok: true; message?: string } | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/;

/** Every admin action: check the role first, then do the work as system (admins are trusted). */
async function run(fn: (admin: SessionUser) => Promise<Result | void>): Promise<Result> {
  const admin = await requireAdmin();
  try {
    const r = await fn(admin);
    revalidatePath('/app/admin', 'layout');
    return r ?? { ok: true };
  } catch (err) {
    console.error('admin action failed', err);
    return { ok: false, error: err instanceof AdminError ? err.message : dbErrorMessage(err) };
  }
}

class AdminError extends Error {}

function reasonOf(text: string, min = 5): string {
  const r = cleanUserText(text ?? '', 500);
  if (r.length < min) throw new AdminError('Add a short reason. It is shared with the team.');
  return r;
}

async function log(teamId: string, actorId: string, action: string, detail: Record<string, unknown>, athleteId: string | null = null) {
  await sys.query(`insert into activity_log (team_id, athlete_id, actor_id, action, detail) values ($1, $2, $3, $4, $5)`, [teamId, athleteId, actorId, action, JSON.stringify(detail)]);
}

// Verification -----------------------------------------------------------------

export async function approveVerification(teamId: string): Promise<Result> {
  return run(async (admin) => {
    if (!UUID.test(teamId)) return { ok: false, error: 'Team not found.' };
    const t = await sys.one<{ name: string }>(
      `update teams set verification_status = 'verified', verified_at = now(), verification_method = coalesce(verification_method, 'document'), verification_note = null
       where id = $1 and verification_status <> 'verified' returning name`,
      [teamId],
    );
    if (!t) return { ok: false, error: 'This team is already verified or no longer exists.' };
    await log(teamId, admin.id, 'verification_approved', {});
    await notifyTeamStaff(sys, teamId, {
      kind: 'verification',
      subject: `${t.name} is verified`,
      body: `We checked your documents and verified ${t.name}. You can publish the team page when the roster and gear are ready.`,
      link: `${env.appUrl}/app/manager/${teamId}`,
    });
    flushSoon();
    return { ok: true, message: `${t.name} verified` };
  });
}

export async function rejectVerification(teamId: string, reason: string): Promise<Result> {
  return run(async (admin) => {
    if (!UUID.test(teamId)) return { ok: false, error: 'Team not found.' };
    const note = reasonOf(reason);
    const t = await sys.one<{ name: string }>(
      `update teams set verification_status = 'rejected', verification_note = $2, verified_at = null where id = $1 returning name`,
      [teamId, note],
    );
    if (!t) return { ok: false, error: 'Team not found.' };
    await log(teamId, admin.id, 'verification_rejected', { reason: note });
    await notifyTeamStaff(sys, teamId, {
      kind: 'verification',
      subject: `We could not verify ${t.name}`,
      body: `We could not verify ${t.name} yet. Reason: ${note}\n\nUpload a new document from team settings and we will look again.`,
      link: `${env.appUrl}/app/manager/${teamId}/settings`,
    });
    flushSoon();
    return { ok: true, message: 'Verification rejected' };
  });
}

// Teams -----------------------------------------------------------------------

export async function suspendTeam(teamId: string, reason: string): Promise<Result> {
  return run(async (admin) => {
    if (!UUID.test(teamId)) return { ok: false, error: 'Team not found.' };
    const note = reasonOf(reason);
    const before = await sys.one<{ status: string; name: string }>(`select status, name from teams where id = $1`, [teamId]);
    if (!before) return { ok: false, error: 'Team not found.' };
    if (before.status === 'suspended') return { ok: false, error: 'This team is already suspended.' };
    await sys.query(`update teams set status = 'suspended' where id = $1`, [teamId]);
    await log(teamId, admin.id, 'team_suspended', { reason: note, previous_status: before.status });
    await notifyTeamStaff(sys, teamId, {
      kind: 'team_suspended',
      subject: `${before.name} is suspended`,
      body: `Gridiron Give suspended ${before.name}. The team page is hidden and new gifts are paused. Reason: ${note}\n\nReply to this email if you have questions.`,
      link: `${env.appUrl}/app/manager/${teamId}`,
    });
    flushSoon();
    await broadcastTeam(teamId);
    return { ok: true, message: `${before.name} suspended` };
  });
}

export async function reinstateTeam(teamId: string, note: string): Promise<Result> {
  return run(async (admin) => {
    if (!UUID.test(teamId)) return { ok: false, error: 'Team not found.' };
    const t = await sys.one<{ status: string; name: string; published_at: Date | null }>(`select status, name, published_at from teams where id = $1`, [teamId]);
    if (!t) return { ok: false, error: 'Team not found.' };
    if (t.status !== 'suspended') return { ok: false, error: 'This team is not suspended.' };
    const last = await sys.one<{ prev: string | null }>(
      `select detail->>'previous_status' as prev from activity_log where team_id = $1 and action = 'team_suspended' order by created_at desc limit 1`,
      [teamId],
    );
    const restored = last?.prev && ['draft', 'live', 'season_closed'].includes(last.prev) ? last.prev : t.published_at ? 'live' : 'draft';
    const clean = cleanUserText(note ?? '', 500);
    await sys.query(`update teams set status = $2 where id = $1`, [teamId, restored]);
    await log(teamId, admin.id, 'team_reinstated', { status: restored, note: clean || null });
    await notifyTeamStaff(sys, teamId, {
      kind: 'team_suspended',
      subject: `${t.name} is active again`,
      body: `Gridiron Give lifted the suspension on ${t.name}.${restored === 'live' ? ' The team page is visible again and gifts are open.' : ''}${clean ? `\n\nNote: ${clean}` : ''}`,
      link: `${env.appUrl}/app/manager/${teamId}`,
    });
    flushSoon();
    await broadcastTeam(teamId);
    return { ok: true, message: `${t.name} reinstated` };
  });
}

// Donations and refunds ---------------------------------------------------------

/**
 * Refunds a whole gift. With Stripe the refund is created there and the
 * charge.refunded webhook reverses the allocations; simulated gifts are
 * reversed here directly. Either way the refund request is resolved and the
 * athlete's family is told the items reopened.
 */
export async function refundDonation(donationId: string, reason: string): Promise<Result> {
  return run(async (admin) => {
    if (!UUID.test(donationId)) return { ok: false, error: 'Gift not found.' };
    const note = reasonOf(reason);
    const d = await sys.one<any>(`select id, team_id, status, payment_intent_id, total_cents, gift_cents, donor_name from donations where id = $1`, [donationId]);
    if (!d) return { ok: false, error: 'Gift not found.' };
    if (d.status !== 'succeeded' && d.status !== 'disputed') return { ok: false, error: `This gift is ${d.status} and can't be refunded.` };
    const athletes = await sys.query<{ athlete_id: string }>(
      `select distinct n.athlete_id from allocations al join needs n on n.id = al.need_id where al.donation_id = $1 and al.reversed_at is null and n.athlete_id is not null`,
      [donationId],
    );
    const viaStripe = mode.payments === 'stripe' && typeof d.payment_intent_id === 'string' && d.payment_intent_id.startsWith('pi_');
    if (viaStripe) {
      try {
        await stripe().refunds.create(stripeRefundParams(d.payment_intent_id, d.id),
          { idempotencyKey: `refund_${d.id}` },
        );
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? 'Stripe refused the refund.';
        return { ok: false, error: `Stripe: ${msg}` };
      }
      await sys.query(
        `update refund_requests set status = 'refunded', resolved_at = now(), resolution_note = $2 where donation_id = $1 and status = 'open'`,
        [donationId, note],
      );
    } else {
      const done = await reverseDonation(donationId, 'refunded', note);
      if (!done) return { ok: false, error: 'This gift was already reversed.' };
    }
    await log(d.team_id, admin.id, 'donation_refunded', { donation_id: d.id, amount_cents: d.total_cents, reason: note, via: viaStripe ? 'stripe' : 'direct' });
    for (const a of athletes) {
      await notifyAthleteFamily(sys, a.athlete_id, {
        kind: 'refund',
        subject: 'A gift toward your gear was refunded',
        body: 'A supporter\'s gift was refunded, so the items it funded are open again. Share your page to find a new supporter.',
        link: `${env.appUrl}/app/athlete/${a.athlete_id}/gear`,
      });
    }
    flushSoon();
    return { ok: true, message: viaStripe ? 'Refund sent to Stripe. The gift reverses when Stripe confirms it.' : `Refunded ${money(d.total_cents)}` };
  });
}

export async function declineRefundRequest(requestId: string, note: string): Promise<Result> {
  return run(async (admin) => {
    if (!UUID.test(requestId)) return { ok: false, error: 'Request not found.' };
    const clean = reasonOf(note);
    const r = await sys.one<{ team_id: string; donation_id: string; requested_by: string | null }>(
      `update refund_requests set status = 'declined', resolution_note = $2, resolved_at = now() where id = $1 and status = 'open' returning team_id, donation_id, requested_by`,
      [requestId, clean],
    );
    if (!r) return { ok: false, error: 'This request was already handled.' };
    await log(r.team_id, admin.id, 'refund_declined', { donation_id: r.donation_id, note: clean });
    await notifyTeamStaff(sys, r.team_id, {
      kind: 'refund_request',
      subject: 'Refund request declined',
      body: `Gridiron Give declined a refund request. Note: ${clean}`,
      link: `${env.appUrl}/app/manager/${r.team_id}/donations`,
    });
    flushSoon();
    return { ok: true, message: 'Request declined' };
  });
}

// Moderation --------------------------------------------------------------------

export async function hideReportedAthlete(reportId: string, reason: string): Promise<Result> {
  return run(async (admin) => {
    if (!UUID.test(reportId)) return { ok: false, error: 'Report not found.' };
    const note = reasonOf(reason);
    const rep = await sys.one<{ athlete_id: string | null; team_id: string | null }>(`select athlete_id, team_id from reports where id = $1`, [reportId]);
    if (!rep?.athlete_id) return { ok: false, error: 'This report is not about a player page.' };
    const a = await sys.one<any>(
      `update athletes set status = 'hidden', hidden_reason = 'manager', review_note = $2 where id = $1
       returning id, team_id, first_name, last_name, pub_preferred_name, show_full_last_name`,
      [rep.athlete_id, note],
    );
    if (!a) return { ok: false, error: 'That player page is gone.' };
    await sys.query(`update reports set status = 'resolved' where athlete_id = $1 and status = 'open'`, [a.id]);
    await log(a.team_id, admin.id, 'athlete_hidden_by_admin', { report_id: reportId, reason: note }, a.id);
    const name = athleteDisplayName(a, a.pub_preferred_name);
    await notifyTeamStaff(sys, a.team_id, {
      kind: 'moderation',
      subject: `${name}'s page was hidden`,
      body: `Gridiron Give hid ${name}'s page after a report. Reason: ${note}\n\nFix the page, then show it again from the roster.`,
      link: `${env.appUrl}/app/manager/${a.team_id}/roster`,
    });
    await notifyAthleteFamily(sys, a.id, {
      kind: 'moderation',
      subject: 'Your page was hidden',
      body: `Gridiron Give hid ${name}'s page for review. The coach has the details and can show it again.`,
      link: `${env.appUrl}/app/athlete/${a.id}`,
    });
    flushSoon();
    await broadcastTeam(a.team_id);
    return { ok: true, message: 'Page hidden' };
  });
}

export async function dismissReport(reportId: string): Promise<Result> {
  return run(async (admin) => {
    if (!UUID.test(reportId)) return { ok: false, error: 'Report not found.' };
    const r = await sys.one<{ team_id: string | null; athlete_id: string | null }>(`update reports set status = 'resolved' where id = $1 and status = 'open' returning team_id, athlete_id`, [reportId]);
    if (!r) return { ok: false, error: 'This report was already handled.' };
    if (r.team_id) await log(r.team_id, admin.id, 'report_dismissed', { report_id: reportId }, r.athlete_id);
    return { ok: true, message: 'Report dismissed' };
  });
}

export async function moderateMessage(donationId: string, decision: 'approved' | 'rejected'): Promise<Result> {
  return run(async (admin) => {
    if (!UUID.test(donationId) || !['approved', 'rejected'].includes(decision)) return { ok: false, error: 'Message not found.' };
    const d = await sys.one<{ team_id: string; athlete_id: string | null }>(
      `update donations set message_status = $2 where id = $1 and message is not null returning team_id, athlete_id`,
      [donationId, decision],
    );
    if (!d) return { ok: false, error: 'Message not found.' };
    await log(d.team_id, admin.id, decision === 'approved' ? 'message_approved_by_admin' : 'message_rejected_by_admin', { donation_id: donationId }, d.athlete_id);
    return { ok: true, message: decision === 'approved' ? 'Message approved' : 'Message hidden' };
  });
}

export async function rejectThankYou(thankYouId: string, note: string): Promise<Result> {
  return run(async (admin) => {
    if (!UUID.test(thankYouId)) return { ok: false, error: 'Note not found.' };
    const clean = reasonOf(note);
    const t = await sys.one<{ team_id: string; athlete_id: string; status: string }>(
      `update thank_yous set status = 'rejected', review_note = $2 where id = $1 and status in ('pending', 'approved') returning team_id, athlete_id, status`,
      [thankYouId, clean],
    );
    if (!t) return { ok: false, error: 'This note was already sent or rejected.' };
    await log(t.team_id, admin.id, 'thankyou_rejected_by_admin', { thank_you_id: thankYouId, note: clean }, t.athlete_id);
    await notifyAthleteFamily(sys, t.athlete_id, {
      kind: 'moderation',
      subject: 'Your thank-you note was not sent',
      body: `Gridiron Give held back a thank-you note. Note: ${clean}\n\nYou can write a new one from Supporters.`,
      link: `${env.appUrl}/app/athlete/${t.athlete_id}/supporters`,
    });
    flushSoon();
    return { ok: true, message: 'Note rejected' };
  });
}

// Catalog -----------------------------------------------------------------------

export interface CatalogInput {
  id?: string | null;
  sport: string;
  category: string;
  name: string;
  description: string;
  priceMin: string;
  priceMax: string;
  priceDefault: string;
  safetyNote: string;
  sizes: string;
  positions: string;
  active: boolean;
  sort: string;
}

const list = (s: string, max: number) =>
  [...new Set((s ?? '').split(',').map((x) => cleanUserText(x, 20)).filter(Boolean))].slice(0, max);

export async function saveCatalogItem(input: CatalogInput): Promise<Result> {
  return run(async () => {
    const sport = cleanUserText(input.sport ?? '', 30).toLowerCase();
    const category = cleanUserText(input.category ?? '', 40);
    const name = cleanUserText(input.name ?? '', 80);
    if (!/^[a-z][a-z -]*$/.test(sport)) return { ok: false, error: 'Sport: use lowercase letters, like football.' };
    if (!category) return { ok: false, error: 'Add a category.' };
    if (!name) return { ok: false, error: 'Add a name.' };
    const min = parseDollarsToCents(input.priceMin ?? '');
    const max = parseDollarsToCents(input.priceMax ?? '');
    const def = parseDollarsToCents(input.priceDefault ?? '');
    if (min === null || max === null || def === null) return { ok: false, error: 'Enter prices in dollars, like 250 or 249.99.' };
    if (min <= 0) return { ok: false, error: 'The lowest price must be more than $0.' };
    if (max < min) return { ok: false, error: 'The highest price must be at least the lowest price.' };
    if (def < min || def > max) return { ok: false, error: `The default price must be between ${money(min)} and ${money(max)}.` };
    const sort = Number.parseInt(input.sort ?? '0', 10);
    if (!Number.isFinite(sort) || Math.abs(sort) > 100000) return { ok: false, error: 'Sort order must be a whole number.' };
    const values = [
      sport, category, name, cleanUserText(input.description ?? '', 300) || null, min, max, def,
      cleanUserText(input.safetyNote ?? '', 300) || null, list(input.sizes, 12), list(input.positions.toUpperCase(), 16), Boolean(input.active), sort,
    ];
    if (input.id) {
      if (!UUID.test(input.id)) return { ok: false, error: 'Item not found.' };
      const r = await sys.one(
        `update gear_catalog set sport = $2, category = $3, name = $4, description = $5, price_min_cents = $6, price_max_cents = $7, default_price_cents = $8,
           safety_note = $9, sizes = $10, positions = $11, active = $12, sort = $13 where id = $1 returning id`,
        [input.id, ...values],
      );
      if (!r) return { ok: false, error: 'Item not found.' };
      return { ok: true, message: `${name} saved` };
    }
    await sys.query(
      `insert into gear_catalog (sport, category, name, description, price_min_cents, price_max_cents, default_price_cents, safety_note, sizes, positions, active, sort)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      values,
    );
    return { ok: true, message: `${name} added` };
  }).then((r) => (!r.ok && r.error === 'That already exists.' ? { ok: false, error: 'An item with that name already exists for this sport.' } : r));
}

// Email outbox --------------------------------------------------------------------

export async function retryFailedNotifications(): Promise<Result> {
  return run(async () => {
    const rows = await sys.query(`update notifications set status = 'queued', error = null, sent_at = null where status = 'failed' returning id`);
    flushSoon();
    return { ok: true, message: rows.length ? `Retrying ${rows.length} ${rows.length === 1 ? 'email' : 'emails'}` : 'Nothing to retry' };
  });
}

/** Re-sends one notification's email, for example after fixing an address. */
export async function retryNotification(id: string): Promise<Result> {
  return run(async () => {
    if (!UUID.test(id)) return { ok: false, error: 'Not found.' };
    const r = await sys.one(`update notifications set status = 'queued', error = null, sent_at = null where id = $1 and status = 'failed' returning id`, [id]);
    if (!r) return { ok: false, error: 'Only failed emails can be retried.' };
    flushSoon();
    return { ok: true, message: 'Retrying' };
  });
}
