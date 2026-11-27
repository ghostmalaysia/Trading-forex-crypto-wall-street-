create table if not exists public.live_events (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  proposal_ref text,
  approval_ref text,
  order_ref text,
  event text not null,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_live_events_user_key_created on public.live_events(user_key, created_at desc);
create index if not exists idx_live_events_proposal_ref on public.live_events(proposal_ref);

alter table public.live_events enable row level security;

drop policy if exists "live_events_own_rows_select" on public.live_events;
drop policy if exists "live_events_own_rows_insert" on public.live_events;

create policy "live_events_own_rows_select" on public.live_events
  for select to authenticated using ((select auth.uid())::text = user_key);
create policy "live_events_own_rows_insert" on public.live_events
  for insert to authenticated with check ((select auth.uid())::text = user_key);

revoke all privileges on public.live_events from anon;
grant select, insert on public.live_events to authenticated;
