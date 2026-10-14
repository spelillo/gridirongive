-- Local stand-in for the pieces of Supabase that the migrations depend on.
-- Applied only to the embedded database (PGlite) used by demo mode and the
-- test suite. Never run this against a Supabase project.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

-- Same definition Supabase uses: the user id comes from the request's JWT claims.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

-- Magic links for demo mode sign-in.
create table if not exists auth.demo_links (
  token_hash text primary key,
  email text not null,
  next_path text,
  code text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
