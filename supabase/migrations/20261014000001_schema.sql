-- Gridiron Give: core schema.
-- Money is stored in integer cents. Need totals change only through the
-- allocations and fund_transfers tables (see triggers at the bottom), so there
-- is exactly one place where "raised" moves.

-- Role used for signed-in requests. The app connects as the database owner and
-- switches to this role inside a transaction (see src/lib/db), which makes the
-- row level security policies in the next migration apply.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'gg_user') then
    create role gg_user nologin;
  end if;
end $$;
grant gg_user to current_user;
grant usage on schema public to gg_user;

-- Enumerations ---------------------------------------------------------------
create type team_status as enum ('draft', 'live', 'season_closed', 'suspended');
create type verification_status as enum ('unverified', 'under_review', 'verified', 'rejected');
create type payouts_status as enum ('not_connected', 'pending', 'connected', 'restricted');
create type member_role as enum ('coach', 'staff', 'viewer');
create type member_status as enum ('invited', 'active', 'removed');
create type athlete_status as enum (
  'needs_consent', 'draft', 'awaiting_guardian', 'awaiting_coach', 'changes_requested', 'live', 'hidden'
);
create type invite_status as enum ('not_sent', 'sent', 'opened', 'accepted', 'bounced');
create type need_kind as enum ('athlete', 'team', 'team_fund');
create type need_status as enum ('open', 'partially_funded', 'funded', 'purchased', 'delivered', 'removed');
create type request_status as enum ('approved', 'pending', 'rejected');
create type donation_status as enum ('pending', 'succeeded', 'failed', 'refunded', 'disputed');
create type message_status as enum ('none', 'pending', 'approved', 'rejected');
create type thankyou_status as enum ('pending', 'approved', 'rejected', 'sent');
create type season_status as enum ('upcoming', 'active', 'closed');
create type notification_status as enum ('queued', 'sent', 'failed', 'skipped');

-- People ---------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  is_admin boolean not null default false,
  email_prefs jsonb not null default '{"donations":"instant","approvals":"instant","updates":"instant"}',
  created_at timestamptz not null default now()
);
create unique index profiles_email_idx on profiles (lower(email));

-- Organizations and teams ---------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  state text not null check (char_length(state) = 2),
  website text,
  domain text,
  ein text,
  tax_exempt boolean not null default false,
  created_at timestamptz not null default now()
);
create index organizations_name_idx on organizations (lower(name));

create table teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  sport text not null default 'football',
  level text not null default 'varsity',
  mascot text,
  city text not null,
  state text not null check (char_length(state) = 2),
  zip text,
  about text not null default '' check (char_length(about) <= 1000),
  photo_path text,
  status team_status not null default 'draft',
  verification_status verification_status not null default 'unverified',
  verification_method text,
  verification_doc_path text,
  verification_contact text,
  verification_note text,
  verified_at timestamptz,
  code_hash text not null unique,
  code_version integer not null default 1,
  payouts_status payouts_status not null default 'not_connected',
  stripe_account_id text unique,
  require_profile_approval boolean not null default true,
  require_thankyou_approval boolean not null default true,
  require_message_approval boolean not null default true,
  show_amounts_to_athletes boolean not null default false,
  current_season_id uuid,
  default_template_id uuid,
  created_by uuid references profiles (id),
  published_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index teams_search_idx on teams (lower(name));
create index teams_state_idx on teams (state);

-- The plain team code, readable only by the team's members. Lookups use
-- teams.code_hash (an HMAC computed by the app), never this table.
create table team_secrets (
  team_id uuid primary key references teams (id) on delete cascade,
  code text not null
);

create table seasons (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  label text not null,
  starts_on date,
  ends_on date,
  status season_status not null default 'active',
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table teams add constraint teams_current_season_fk foreign key (current_season_id) references seasons (id);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  user_id uuid references profiles (id) on delete cascade,
  email text not null,
  role member_role not null,
  title text,
  status member_status not null default 'invited',
  created_at timestamptz not null default now(),
  unique (team_id, email)
);
create index team_members_user_idx on team_members (user_id) where status = 'active';

-- Athletes -------------------------------------------------------------------
create table athletes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  jersey text,
  position text,
  position_group text check (position_group in ('offense', 'defense', 'special')),
  grade integer check (grade between 1 and 12),
  under_13 boolean not null default false,
  slug text not null,
  status athlete_status not null default 'needs_consent',
  hidden_reason text,
  review_note text,
  show_full_last_name boolean not null default false,
  athlete_can_edit boolean not null default true,
  -- Working copy, edited by the athlete or guardian.
  bio text not null default '' check (char_length(bio) <= 500),
  photo_path text,
  photo_alt text,
  -- Published copy, what people with the code see. Copied on approval.
  pub_preferred_name text,
  pub_bio text,
  pub_photo_path text,
  published_at timestamptz,
  share_token text not null unique,
  invite_status invite_status not null default 'not_sent',
  invite_sent_at timestamptz,
  invite_opened_at timestamptz,
  invite_accepted_at timestamptz,
  consent_at timestamptz,
  submitted_at timestamptz,
  setup_step integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, slug)
);
create index athletes_team_idx on athletes (team_id) where archived_at is null;

-- Contact details live apart from the athlete row so that no query for a
-- public page can select them by accident.
create table athlete_contacts (
  athlete_id uuid primary key references athletes (id) on delete cascade,
  guardian_email text,
  guardian2_email text,
  guardian_phone text,
  athlete_email text
);

create table athlete_access (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role text not null check (role in ('guardian', 'athlete')),
  created_at timestamptz not null default now(),
  unique (athlete_id, user_id)
);
create index athlete_access_user_idx on athlete_access (user_id);

create table consents (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  guardian_user_id uuid not null references profiles (id),
  signed_name text not null,
  ip text,
  user_agent text,
  show_full_last_name boolean not null,
  athlete_can_edit boolean not null,
  policy_version text not null default '2026-10',
  signed_at timestamptz not null default now(),
  withdrawn_at timestamptz
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  kind text not null check (kind in ('athlete', 'staff')),
  team_id uuid not null references teams (id) on delete cascade,
  athlete_id uuid references athletes (id) on delete cascade,
  email text not null,
  role text not null,
  expires_at timestamptz not null,
  opened_at timestamptz,
  used_at timestamptz,
  used_by uuid references profiles (id),
  send_count integer not null default 1,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index invites_athlete_idx on invites (athlete_id);

-- Gear -----------------------------------------------------------------------
create table gear_catalog (
  id uuid primary key default gen_random_uuid(),
  sport text not null,
  category text not null,
  name text not null,
  description text,
  price_min_cents integer not null check (price_min_cents >= 0),
  price_max_cents integer not null check (price_max_cents >= price_min_cents),
  default_price_cents integer not null,
  safety_note text,
  sizes text[] not null default '{}',
  positions text[] not null default '{}',
  sort integer not null default 0,
  active boolean not null default true,
  unique (sport, name)
);

create table gear_templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams (id) on delete cascade,
  sport text not null,
  name text not null,
  positions text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table gear_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references gear_templates (id) on delete cascade,
  catalog_id uuid not null references gear_catalog (id),
  size text,
  price_cents integer not null check (price_cents > 0),
  sort integer not null default 0,
  unique (template_id, catalog_id)
);
alter table teams add constraint teams_default_template_fk foreign key (default_template_id) references gear_templates (id) on delete set null;

create table needs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  season_id uuid not null references seasons (id),
  athlete_id uuid references athletes (id) on delete cascade,
  kind need_kind not null default 'athlete',
  catalog_id uuid references gear_catalog (id),
  name text not null check (char_length(name) between 1 and 80),
  variant text,
  price_cents integer check (price_cents is null or price_cents > 0),
  raised_cents integer not null default 0 check (raised_cents >= 0),
  status need_status not null default 'open',
  sort integer not null default 0,
  pin_x real check (pin_x between 0 and 1),
  pin_y real check (pin_y between 0 and 1),
  why_note text check (char_length(why_note) <= 140),
  request_status request_status not null default 'approved',
  request_reason text,
  price_note text,
  purchase_id uuid,
  purchased_at timestamptz,
  delivered_at timestamptz,
  delivery_photo_path text,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'athlete') = (athlete_id is not null)),
  check ((kind = 'team_fund') = (price_cents is null))
);
create index needs_athlete_idx on needs (athlete_id) where status <> 'removed';
create index needs_team_idx on needs (team_id, season_id);
create unique index needs_one_team_fund_idx on needs (team_id, season_id) where kind = 'team_fund';

-- Money ----------------------------------------------------------------------
create table donations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id),
  season_id uuid not null references seasons (id),
  athlete_id uuid references athletes (id) on delete set null,
  target text not null check (target in ('need', 'fund_rest', 'athlete', 'team_fund')),
  status donation_status not null default 'pending',
  donor_name text not null,
  donor_email text not null,
  show_name boolean not null default true,
  message text check (char_length(message) <= 200),
  message_status message_status not null default 'none',
  gift_cents integer not null check (gift_cents >= 500),
  cover_fees boolean not null,
  platform_fee_cents integer not null,
  stripe_fee_cents integer not null,
  total_cents integer not null,
  net_cents integer not null,
  send_extra_to_fund boolean not null default false,
  idempotency_key text not null unique,
  payment_intent_id text unique,
  charge_id text,
  card_brand text,
  card_last4 text,
  failure_reason text,
  source_token text,
  donor_user_id uuid references profiles (id),
  created_at timestamptz not null default now(),
  succeeded_at timestamptz,
  refunded_at timestamptz
);
create index donations_team_idx on donations (team_id, created_at desc);
create index donations_athlete_idx on donations (athlete_id) where status = 'succeeded';

-- What the donor asked for. A line with need_id set targets one need. A line
-- with only athlete_id set targets that athlete's open needs, cheapest first.
-- A line with neither targets the team fund.
create table donation_lines (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references donations (id) on delete cascade,
  need_id uuid references needs (id),
  athlete_id uuid references athletes (id),
  requested_cents integer not null check (requested_cents > 0)
);

-- What the money actually funded, written when the payment succeeds.
create table allocations (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references donations (id),
  need_id uuid not null references needs (id),
  amount_cents integer not null check (amount_cents > 0),
  overflow boolean not null default false,
  reversed_at timestamptz,
  created_at timestamptz not null default now()
);
create index allocations_need_idx on allocations (need_id) where reversed_at is null;
create index allocations_donation_idx on allocations (donation_id);

-- Money moved between needs after the fact: a removed need, an athlete who
-- left, or a season close. Always into the team fund in v1.
create table fund_transfers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id),
  from_need_id uuid not null references needs (id),
  to_need_id uuid not null references needs (id),
  amount_cents integer not null check (amount_cents > 0),
  reason text not null,
  actor_id uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id),
  season_id uuid not null references seasons (id),
  vendor text not null,
  order_date date not null,
  total_cents integer not null check (total_cents > 0),
  receipt_path text not null,
  note text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
alter table needs add constraint needs_purchase_fk foreign key (purchase_id) references purchases (id);

create table purchase_needs (
  purchase_id uuid not null references purchases (id) on delete cascade,
  need_id uuid not null references needs (id),
  amount_cents integer not null check (amount_cents >= 0),
  primary key (purchase_id, need_id)
);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id),
  stripe_payout_id text unique,
  amount_cents integer not null,
  status text not null,
  arrival_date date,
  created_at timestamptz not null default now()
);

create table refund_requests (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references donations (id),
  team_id uuid not null references teams (id),
  requested_by uuid references profiles (id),
  reason text not null,
  status text not null default 'open' check (status in ('open', 'refunded', 'declined')),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

-- Communication ----------------------------------------------------------------
create table thank_yous (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  need_id uuid references needs (id),
  donation_id uuid references donations (id),
  body text not null check (char_length(body) between 1 and 500),
  photo_path text,
  status thankyou_status not null default 'pending',
  review_note text,
  recipients_count integer not null default 0,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id) on delete cascade,
  email text,
  kind text not null,
  subject text not null,
  body text not null,
  link text,
  in_app boolean not null default true,
  send_email boolean not null default true,
  status notification_status not null default 'queued',
  error text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notifications_user_idx on notifications (user_id, created_at desc);
create index notifications_queue_idx on notifications (created_at) where status = 'queued';

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  athlete_id uuid references athletes (id) on delete cascade,
  actor_id uuid references profiles (id),
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index activity_team_idx on activity_log (team_id, created_at desc);

create table share_links (
  token text primary key,
  team_id uuid not null references teams (id) on delete cascade,
  athlete_id uuid references athletes (id) on delete cascade,
  active boolean not null default true,
  visits integer not null default 0,
  created_at timestamptz not null default now()
);

create table unlock_attempts (
  id bigint generated always as identity primary key,
  key text not null,
  team_id uuid,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index unlock_attempts_key_idx on unlock_attempts (key, created_at desc);

create table reports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams (id) on delete cascade,
  athlete_id uuid references athletes (id) on delete cascade,
  reason text not null,
  reporter_email text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

create table analytics_events (
  id bigint generated always as identity primary key,
  name text not null,
  props jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Triggers -------------------------------------------------------------------
create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger teams_touch before update on teams for each row execute function touch_updated_at();
create trigger athletes_touch before update on athletes for each row execute function touch_updated_at();

-- A need's funding status follows from its numbers unless it has moved on to
-- purchased, delivered or removed.
create function needs_derive_status() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status in ('purchased', 'delivered', 'removed') then
    return new;
  end if;
  if new.price_cents is null then
    new.status := 'open';
  elsif new.raised_cents >= new.price_cents then
    new.status := 'funded';
  elsif new.raised_cents > 0 then
    new.status := 'partially_funded';
  else
    new.status := 'open';
  end if;
  return new;
end $$;
create trigger needs_status before insert or update on needs for each row execute function needs_derive_status();

-- raised_cents is only ever moved by these two triggers.
create function allocations_apply() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.reversed_at is null then
    update needs set raised_cents = raised_cents + new.amount_cents where id = new.need_id;
  elsif tg_op = 'UPDATE' and old.reversed_at is null and new.reversed_at is not null then
    update needs set raised_cents = greatest(raised_cents - old.amount_cents, 0),
      status = case when status in ('purchased', 'delivered') then status else 'open' end
    where id = old.need_id;
  end if;
  return new;
end $$;
create trigger allocations_after after insert or update on allocations for each row execute function allocations_apply();

create function fund_transfers_apply() returns trigger language plpgsql as $$
begin
  update needs set raised_cents = raised_cents - new.amount_cents where id = new.from_need_id;
  update needs set raised_cents = raised_cents + new.amount_cents where id = new.to_need_id;
  return new;
end $$;
create trigger fund_transfers_after after insert on fund_transfers for each row execute function fund_transfers_apply();

create function touch_team_activity() returns trigger language plpgsql as $$
begin
  update teams set last_activity_at = now() where id = new.team_id;
  return new;
end $$;
create trigger donations_activity after update of status on donations
  for each row when (new.status = 'succeeded') execute function touch_team_activity();

-- Totals ---------------------------------------------------------------------
-- Every page reads totals from these views. Nothing adds money up in the browser.
create view athlete_totals with (security_invoker = true) as
select
  a.id as athlete_id,
  a.team_id,
  coalesce(sum(n.price_cents), 0)::int as goal_cents,
  coalesce(sum(least(n.raised_cents, n.price_cents)), 0)::int as raised_cents,
  coalesce(sum(greatest(n.price_cents - n.raised_cents, 0)) filter (where n.status in ('open', 'partially_funded')), 0)::int as remaining_cents,
  count(n.id)::int as items_total,
  (count(n.id) filter (where n.status in ('funded', 'purchased', 'delivered')))::int as items_funded
from athletes a
join teams t on t.id = a.team_id
left join needs n on n.athlete_id = a.id
  and n.season_id = t.current_season_id
  and n.status <> 'removed'
  and n.request_status = 'approved'
group by a.id, a.team_id;

create view team_totals with (security_invoker = true) as
select
  t.id as team_id,
  coalesce(sum(n.price_cents) filter (where n.kind <> 'team_fund'), 0)::int as goal_cents,
  coalesce(sum(case when n.kind = 'team_fund' then n.raised_cents else least(n.raised_cents, n.price_cents) end), 0)::int as raised_cents,
  (count(n.id) filter (where n.kind <> 'team_fund'))::int as items_total,
  (count(n.id) filter (where n.kind <> 'team_fund' and n.status in ('funded', 'purchased', 'delivered')))::int as items_funded,
  coalesce(sum(n.raised_cents) filter (where n.kind = 'team_fund'), 0)::int as team_fund_cents,
  (select count(*) from athletes a where a.team_id = t.id and a.status = 'live' and a.archived_at is null)::int as athletes_live
from teams t
left join needs n on n.team_id = t.id
  and n.season_id = t.current_season_id
  and n.status <> 'removed'
  and n.request_status = 'approved'
  and (n.athlete_id is null or exists (
    select 1 from athletes a2 where a2.id = n.athlete_id and a2.status = 'live' and a2.archived_at is null
  ))
group by t.id;
