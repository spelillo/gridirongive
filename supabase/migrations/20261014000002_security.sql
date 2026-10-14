-- Gridiron Give: who can see and change what.
--
-- Signed-in requests run as gg_user with the Supabase user id in
-- request.jwt.claims (auth.uid()). Public pages, the Stripe webhook and other
-- system work run as the owner role and never touch these policies; that code
-- lives in src/lib/queries/public.ts and src/lib/payments and only selects
-- public columns.
--
-- Supabase's own API roles (anon, authenticated) get no table access at all.
-- The browser never talks to these tables directly.

-- Helper functions. SECURITY DEFINER so policies can look up membership
-- without recursing into the policies on the membership tables themselves.
create function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_admin);
$$;

create function team_role(p_team uuid) returns member_role language sql stable security definer set search_path = public as $$
  select role from team_members where team_id = p_team and user_id = auth.uid() and status = 'active' limit 1;
$$;

create function is_team_member(p_team uuid) returns boolean language sql stable security definer set search_path = public as $$
  select team_role(p_team) is not null or is_admin();
$$;

create function can_edit_team(p_team uuid) returns boolean language sql stable security definer set search_path = public as $$
  select team_role(p_team) in ('coach', 'staff') or is_admin();
$$;

create function is_team_coach(p_team uuid) returns boolean language sql stable security definer set search_path = public as $$
  select team_role(p_team) = 'coach' or is_admin();
$$;

create function athlete_role(p_athlete uuid) returns text language sql stable security definer set search_path = public as $$
  select role from athlete_access where athlete_id = p_athlete and user_id = auth.uid()
  order by case role when 'guardian' then 0 else 1 end limit 1;
$$;

create function has_athlete_in_team(p_team uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from athlete_access aa join athletes a on a.id = aa.athlete_id
    where aa.user_id = auth.uid() and a.team_id = p_team
  );
$$;

-- Turn on RLS everywhere.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'organizations', 'teams', 'team_secrets', 'seasons', 'team_members', 'athletes',
    'athlete_contacts', 'athlete_access', 'consents', 'invites', 'gear_catalog', 'gear_templates',
    'gear_template_items', 'needs', 'donations', 'donation_lines', 'allocations', 'fund_transfers',
    'purchases', 'purchase_needs', 'payouts', 'refund_requests', 'stripe_events', 'thank_yous',
    'notifications', 'activity_log', 'share_links', 'unlock_attempts', 'reports', 'analytics_events'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

grant select, insert, update, delete on all tables in schema public to gg_user;
grant usage on all sequences in schema public to gg_user;
grant execute on all functions in schema public to gg_user;

-- Remove Supabase Data API access. Harmless where the roles don't exist.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
    execute 'alter default privileges in schema public revoke all on tables from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
    execute 'alter default privileges in schema public revoke all on tables from authenticated';
  end if;
end $$;

-- profiles
create policy profiles_select on profiles for select to gg_user
  using (id = auth.uid() or is_admin() or exists (
    select 1 from team_members m1 join team_members m2 on m1.team_id = m2.team_id
    where m1.user_id = auth.uid() and m1.status = 'active' and m2.user_id = profiles.id
  ));
create policy profiles_update on profiles for update to gg_user
  using (id = auth.uid()) with check (id = auth.uid() and is_admin = (select p.is_admin from profiles p where p.id = auth.uid()));

-- organizations: names and towns are public information.
create policy organizations_select on organizations for select to gg_user using (true);
create policy organizations_insert on organizations for insert to gg_user with check (true);
create policy organizations_update on organizations for update to gg_user
  using (is_admin() or exists (select 1 from teams t where t.org_id = organizations.id and is_team_coach(t.id)));

-- teams
create policy teams_select on teams for select to gg_user
  using (is_team_member(id) or has_athlete_in_team(id));
create policy teams_insert on teams for insert to gg_user with check (created_by = auth.uid());
create policy teams_update on teams for update to gg_user using (can_edit_team(id));
create policy teams_delete on teams for delete to gg_user using (is_team_coach(id));

create policy team_secrets_all on team_secrets for all to gg_user
  using (is_team_member(team_id)) with check (can_edit_team(team_id));

create policy seasons_select on seasons for select to gg_user using (is_team_member(team_id) or has_athlete_in_team(team_id));
create policy seasons_write on seasons for all to gg_user using (can_edit_team(team_id)) with check (can_edit_team(team_id));

create policy team_members_select on team_members for select to gg_user using (is_team_member(team_id) or user_id = auth.uid());
create policy team_members_write on team_members for all to gg_user using (is_team_coach(team_id)) with check (is_team_coach(team_id));

-- athletes
create policy athletes_select on athletes for select to gg_user
  using (is_team_member(team_id) or athlete_role(id) is not null);
create policy athletes_insert on athletes for insert to gg_user with check (can_edit_team(team_id));
create policy athletes_update on athletes for update to gg_user
  using (can_edit_team(team_id) or athlete_role(id) is not null);
create policy athletes_delete on athletes for delete to gg_user using (can_edit_team(team_id));

-- Contact details: staff and the athlete's own guardians. Viewers don't see them.
create policy athlete_contacts_select on athlete_contacts for select to gg_user
  using (can_edit_team((select team_id from athletes a where a.id = athlete_id)) or athlete_role(athlete_id) = 'guardian');
create policy athlete_contacts_write on athlete_contacts for all to gg_user
  using (can_edit_team((select team_id from athletes a where a.id = athlete_id)) or athlete_role(athlete_id) = 'guardian')
  with check (can_edit_team((select team_id from athletes a where a.id = athlete_id)) or athlete_role(athlete_id) = 'guardian');

create policy athlete_access_select on athlete_access for select to gg_user
  using (user_id = auth.uid() or athlete_role(athlete_id) = 'guardian'
    or is_team_member((select team_id from athletes a where a.id = athlete_id)));

create policy consents_select on consents for select to gg_user
  using (guardian_user_id = auth.uid() or athlete_role(athlete_id) = 'guardian'
    or can_edit_team((select team_id from athletes a where a.id = athlete_id)));

create policy invites_select on invites for select to gg_user using (can_edit_team(team_id));
create policy invites_write on invites for all to gg_user using (can_edit_team(team_id)) with check (can_edit_team(team_id));

-- Gear catalog and templates
create policy gear_catalog_select on gear_catalog for select to gg_user using (true);
create policy gear_catalog_write on gear_catalog for all to gg_user using (is_admin()) with check (is_admin());
create policy gear_templates_select on gear_templates for select to gg_user
  using (team_id is null or is_team_member(team_id) or has_athlete_in_team(team_id));
create policy gear_templates_write on gear_templates for all to gg_user
  using (team_id is not null and can_edit_team(team_id)) with check (team_id is not null and can_edit_team(team_id));
create policy gear_template_items_select on gear_template_items for select to gg_user
  using (exists (select 1 from gear_templates g where g.id = template_id));
create policy gear_template_items_write on gear_template_items for all to gg_user
  using (exists (select 1 from gear_templates g where g.id = template_id and g.team_id is not null and can_edit_team(g.team_id)))
  with check (exists (select 1 from gear_templates g where g.id = template_id and g.team_id is not null and can_edit_team(g.team_id)));

-- needs
create policy needs_select on needs for select to gg_user
  using (is_team_member(team_id) or (athlete_id is not null and athlete_role(athlete_id) is not null));
create policy needs_insert on needs for insert to gg_user
  with check (can_edit_team(team_id) or (athlete_id is not null and athlete_role(athlete_id) is not null));
create policy needs_update on needs for update to gg_user
  using (can_edit_team(team_id) or (athlete_id is not null and athlete_role(athlete_id) is not null));

-- Money: staff and viewers read it. Athletes and guardians don't; they get
-- the supporters list through a narrower query.
create policy donations_select on donations for select to gg_user
  using (is_team_member(team_id) or donor_user_id = auth.uid());
create policy donations_update on donations for update to gg_user using (can_edit_team(team_id));
create policy donation_lines_select on donation_lines for select to gg_user
  using (exists (select 1 from donations d where d.id = donation_id));
create policy allocations_select on allocations for select to gg_user
  using (exists (select 1 from donations d where d.id = donation_id));
create policy fund_transfers_select on fund_transfers for select to gg_user using (is_team_member(team_id));
create policy purchases_select on purchases for select to gg_user using (is_team_member(team_id));
create policy purchases_write on purchases for all to gg_user using (can_edit_team(team_id)) with check (can_edit_team(team_id));
create policy purchase_needs_select on purchase_needs for select to gg_user
  using (exists (select 1 from purchases p where p.id = purchase_id));
create policy purchase_needs_write on purchase_needs for all to gg_user
  using (exists (select 1 from purchases p where p.id = purchase_id and can_edit_team(p.team_id)))
  with check (exists (select 1 from purchases p where p.id = purchase_id and can_edit_team(p.team_id)));
create policy payouts_select on payouts for select to gg_user using (is_team_coach(team_id));
create policy refund_requests_select on refund_requests for select to gg_user using (is_team_member(team_id));
create policy refund_requests_insert on refund_requests for insert to gg_user with check (can_edit_team(team_id));

-- Communication
create policy thank_yous_select on thank_yous for select to gg_user
  using (is_team_member(team_id) or athlete_role(athlete_id) is not null);
create policy thank_yous_insert on thank_yous for insert to gg_user
  with check (athlete_role(athlete_id) is not null or can_edit_team(team_id));
create policy thank_yous_update on thank_yous for update to gg_user
  using (can_edit_team(team_id) or athlete_role(athlete_id) = 'guardian');

create policy notifications_own on notifications for select to gg_user using (user_id = auth.uid());
create policy notifications_mark on notifications for update to gg_user using (user_id = auth.uid());

create policy activity_select on activity_log for select to gg_user
  using (is_team_member(team_id) or (athlete_id is not null and athlete_role(athlete_id) = 'guardian'));

create policy share_links_select on share_links for select to gg_user
  using (is_team_member(team_id) or (athlete_id is not null and athlete_role(athlete_id) is not null));

create policy reports_admin on reports for select to gg_user using (is_admin());
-- stripe_events, unlock_attempts and analytics_events have no policies: only
-- system code reads or writes them.

-- Column guards. RLS decides which rows a person can touch; these triggers
-- decide which columns a guardian or athlete can change on their own row.
create function athletes_guard() returns trigger language plpgsql as $$
declare
  editor boolean;
  needs_approval boolean;
begin
  if current_user <> 'gg_user' then return new; end if;
  editor := can_edit_team(old.team_id);
  if editor then return new; end if;
  if new.team_id <> old.team_id or new.first_name <> old.first_name or new.last_name <> old.last_name
     or new.jersey is distinct from old.jersey or new.position is distinct from old.position
     or new.grade is distinct from old.grade or new.slug <> old.slug or new.share_token <> old.share_token
     or new.under_13 <> old.under_13 or new.consent_at is distinct from old.consent_at then
    raise exception 'Only the team staff can change roster details' using errcode = '42501';
  end if;
  if old.status = 'needs_consent' and new.status <> 'needs_consent' then
    raise exception 'A parent or guardian needs to give consent first' using errcode = '42501';
  end if;
  if athlete_role(old.id) = 'athlete' then
    if not old.athlete_can_edit then
      raise exception 'Your parent or guardian manages this profile' using errcode = '42501';
    end if;
    if new.show_full_last_name <> old.show_full_last_name or new.athlete_can_edit <> old.athlete_can_edit
       or (old.status = 'hidden' and new.status <> 'hidden') then
      raise exception 'Only a parent or guardian can change this' using errcode = '42501';
    end if;
  end if;
  select require_profile_approval into needs_approval from teams where id = old.team_id;
  if needs_approval and (
       (new.status = 'live' and old.status <> 'live'
         and not (old.status = 'hidden' and old.hidden_reason = 'guardian' and old.published_at is not null))
       or new.pub_bio is distinct from old.pub_bio
       or new.pub_photo_path is distinct from old.pub_photo_path
       or new.pub_preferred_name is distinct from old.pub_preferred_name) then
    raise exception 'This change needs coach approval' using errcode = '42501';
  end if;
  if old.status = 'hidden' and old.hidden_reason = 'manager' and new.status <> 'hidden' then
    raise exception 'Your coach hid this page. Ask them to show it again.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger athletes_guard before update on athletes for each row execute function athletes_guard();

create function needs_guard() returns trigger language plpgsql as $$
begin
  if current_user <> 'gg_user' then return new; end if;
  if can_edit_team(coalesce(new.team_id, old.team_id)) then return new; end if;
  if tg_op = 'INSERT' then
    if new.raised_cents <> 0 or new.status <> 'open' or new.kind <> 'athlete'
       or (new.team_id, new.season_id) is distinct from
          (select a.team_id, t.current_season_id from athletes a join teams t on t.id = a.team_id where a.id = new.athlete_id) then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    -- Items an athlete or guardian adds always go to the coach first.
    new.request_status := 'pending';
    new.purchase_id := null;
    return new;
  end if;
  if new.raised_cents <> old.raised_cents or new.price_cents is distinct from old.price_cents
     or new.team_id <> old.team_id or new.athlete_id is distinct from old.athlete_id
     or new.request_status <> old.request_status
     or new.status in ('purchased', 'delivered') and new.status <> old.status
     or (new.status = 'removed' and old.status <> 'removed' and old.raised_cents > 0) then
    raise exception 'Ask your coach to make this change' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger needs_guard before insert or update on needs for each row execute function needs_guard();
