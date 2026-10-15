-- Private storage buckets for live mode (src/lib/storage). Every file is
-- served through /media after an access check, so none of them is public.
-- The embedded demo database has no storage schema; this does nothing there.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    execute $sql$
      insert into storage.buckets (id, name, public, file_size_limit) values
        ('photos', 'photos', false, 4194304),
        ('team', 'team', false, 4194304),
        ('receipts', 'receipts', false, 4194304),
        ('verification', 'verification', false, 4194304)
      on conflict (id) do update set public = false
    $sql$;
  end if;
end $$;
