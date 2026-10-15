-- Team color: the accent used on the team's public pages, share kit and
-- player cards. Optional; pages fall back to the site's blue.
alter table teams add column color text check (color is null or color ~ '^#[0-9a-f]{6}$');
