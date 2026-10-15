'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { asUser, sys, dbErrorMessage } from '@/lib/db';
import { requireUser, signOut } from '@/lib/auth/session';
import { cleanUserText } from '@/lib/domain/text';
import { mode } from '@/lib/env';
import type { PrefCategory, PrefValue } from '@/lib/notify';
import { accountDeletionBlockers } from '@/lib/app/account';

export type Result = { ok: true; message?: string } | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/;

/** Marks one of the signed-in person's notifications read (notifications_mark policy). */
export async function markNotificationRead(id: string): Promise<Result> {
  const user = await requireUser('/app/notifications');
  if (!UUID.test(id)) return { ok: false, error: 'That notification is gone.' };
  try {
    await asUser(user.id, (tx) => tx.query(`update notifications set read_at = now() where id = $1 and user_id = $2 and read_at is null`, [id, user.id]));
  } catch (err) {
    return { ok: false, error: dbErrorMessage(err) };
  }
  revalidatePath('/app', 'layout');
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<Result> {
  const user = await requireUser('/app/notifications');
  try {
    await asUser(user.id, (tx) => tx.query(`update notifications set read_at = now() where user_id = $1 and in_app and read_at is null`, [user.id]));
  } catch (err) {
    return { ok: false, error: dbErrorMessage(err) };
  }
  revalidatePath('/app', 'layout');
  return { ok: true, message: 'All marked as read' };
}

/** Name and phone on the profile (profiles_update policy). */
export async function saveProfile(data: { fullName: string; phone: string }): Promise<Result> {
  const user = await requireUser('/app/account');
  const name = cleanUserText(data.fullName ?? '', 80).replace(/\s+/g, ' ');
  const phone = cleanUserText(data.phone ?? '', 30);
  if (name && !/^[\p{L}][\p{L}' .,-]*$/u.test(name)) return { ok: false, error: 'Use letters, spaces, hyphens and apostrophes in your name.' };
  const digits = phone.replace(/\D/g, '');
  if (phone && (!/^[+()\d\s.-]+$/.test(phone) || digits.length < 10 || digits.length > 15)) return { ok: false, error: 'Enter a phone number with area code, like 555-123-4567.' };
  try {
    await asUser(user.id, (tx) => tx.query(`update profiles set full_name = nullif($2, ''), phone = nullif($3, '') where id = $1`, [user.id, name, phone]));
  } catch (err) {
    return { ok: false, error: dbErrorMessage(err) };
  }
  revalidatePath('/app', 'layout');
  return { ok: true, message: 'Saved' };
}

const CATEGORIES: PrefCategory[] = ['donations', 'approvals', 'updates'];
const VALUES: PrefValue[] = ['instant', 'digest', 'off'];

export async function saveEmailPref(category: PrefCategory, value: PrefValue): Promise<Result> {
  const user = await requireUser('/app/account');
  if (!CATEGORIES.includes(category) || !VALUES.includes(value)) return { ok: false, error: 'Pick one of the options.' };
  try {
    await asUser(user.id, (tx) =>
      tx.query(`update profiles set email_prefs = coalesce(email_prefs, '{}'::jsonb) || jsonb_build_object($2::text, $3::text) where id = $1`, [user.id, category, value]),
    );
  } catch (err) {
    console.error('saveEmailPref failed', err);
    return { ok: false, error: dbErrorMessage(err) };
  }
  revalidatePath('/app/account');
  return { ok: true, message: 'Saved' };
}

/**
 * Deletes the signed-in person's login and profile. Past gifts stay in the
 * teams' records (they're needed for receipts and the ledger) but are no
 * longer linked to the account.
 */
export async function deleteAccount(confirmEmail: string): Promise<Result> {
  const user = await requireUser('/app/account');
  if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) return { ok: false, error: 'Type your email address exactly to confirm.' };
  if (user.isAdmin) return { ok: false, error: 'Platform admin accounts are removed by changing ADMIN_EMAILS first.' };
  const blockers = await accountDeletionBlockers(user.id);
  if (blockers.length) return { ok: false, error: blockers[0] };
  try {
    await sys.tx(async (tx) => {
      const id = user.id;
      // Keep shared records, drop the link to this person.
      await tx.query(`update donations set donor_user_id = null where donor_user_id = $1`, [id]);
      await tx.query(`update invites set used_by = null where used_by = $1`, [id]);
      await tx.query(`update teams set created_by = null where created_by = $1`, [id]);
      await tx.query(`update fund_transfers set actor_id = null where actor_id = $1`, [id]);
      await tx.query(`update purchases set created_by = null where created_by = $1`, [id]);
      await tx.query(`update thank_yous set created_by = null where created_by = $1`, [id]);
      await tx.query(`update activity_log set actor_id = null where actor_id = $1`, [id]);
      await tx.query(`update refund_requests set requested_by = null where requested_by = $1`, [id]);
      await tx.query(`update team_members set user_id = null, status = 'removed' where user_id = $1`, [id]);
      // Consent records for profiles that were already deleted (no guardian link is left).
      await tx.query(`delete from consents c where c.guardian_user_id = $1 and not exists (select 1 from athlete_access x where x.athlete_id = c.athlete_id and x.user_id = $1)`, [id]);
      await tx.query(`delete from profiles where id = $1`, [id]);
      if (mode.demo) await tx.query(`delete from auth.users where id = $1`, [id]);
    });
    if (!mode.demo) {
      const { supabaseService } = await import('@/lib/auth/supabase');
      const { error } = await supabaseService().auth.admin.deleteUser(user.id);
      if (error) console.error('supabase deleteUser failed', error.message);
    }
  } catch (err) {
    console.error('account delete failed', err);
    return { ok: false, error: dbErrorMessage(err) };
  }
  await signOut();
  redirect('/?account=deleted');
}
