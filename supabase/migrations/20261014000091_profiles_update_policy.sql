-- profiles_update read profiles inside its own WITH CHECK, which Postgres
-- rejects as infinite recursion (42P17) on every update. is_admin() is
-- SECURITY DEFINER, so it reads the current value without the policy.
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to gg_user
  using (id = auth.uid()) with check (id = auth.uid() and is_admin = is_admin());
