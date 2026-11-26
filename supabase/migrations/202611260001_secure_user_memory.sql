-- Replace the MVP's public anonymous access policies with per-user Auth access.
-- Apply this once to existing Supabase projects before enabling authenticated memory.
begin;

alter table public.user_profiles enable row level security;
alter table public.watchlists enable row level security;
alter table public.ai_memory enable row level security;
alter table public.alerts enable row level security;

-- These MVP tables have one intended policy each; remove any older policies
-- first so PostgreSQL's permissive policy OR-combination cannot bypass the new rules.
do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('user_profiles', 'watchlists', 'ai_memory', 'alerts')
  loop
    execute format('drop policy %I on %I.%I', existing_policy.policyname, existing_policy.schemaname, existing_policy.tablename);
  end loop;
end
$$;

create policy "profiles_own_rows" on public.user_profiles
  for all to authenticated using ((select auth.uid())::text = user_key)
  with check ((select auth.uid())::text = user_key);
create policy "watchlists_own_rows" on public.watchlists
  for all to authenticated using ((select auth.uid())::text = user_key)
  with check ((select auth.uid())::text = user_key);
create policy "ai_memory_own_rows" on public.ai_memory
  for all to authenticated using ((select auth.uid())::text = user_key)
  with check ((select auth.uid())::text = user_key);
create policy "alerts_own_rows" on public.alerts
  for all to authenticated using ((select auth.uid())::text = user_key)
  with check ((select auth.uid())::text = user_key);

revoke all privileges on public.user_profiles, public.watchlists, public.ai_memory, public.alerts from anon;
grant select, insert, update, delete on public.user_profiles, public.watchlists, public.ai_memory, public.alerts to authenticated;

commit;
