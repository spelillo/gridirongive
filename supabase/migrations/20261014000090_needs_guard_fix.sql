-- Fix: needs_guard compared a row against a two-column scalar subquery,
-- which Postgres rejects ("subquery must return only one column"), so every
-- item an athlete or guardian tried to add failed. Same rules, read into
-- variables first.
create or replace function needs_guard() returns trigger language plpgsql as $$
declare
  v_team uuid;
  v_season uuid;
begin
  if current_user <> 'gg_user' then return new; end if;
  if can_edit_team(coalesce(new.team_id, old.team_id)) then return new; end if;
  if tg_op = 'INSERT' then
    select a.team_id, t.current_season_id into v_team, v_season
    from athletes a join teams t on t.id = a.team_id where a.id = new.athlete_id;
    if new.raised_cents <> 0 or new.status <> 'open' or new.kind <> 'athlete'
       or v_team is null or new.team_id is distinct from v_team or new.season_id is distinct from v_season then
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
