create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  action text not null,
  entity text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_user_key_created on public.audit_logs(user_key, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_own_rows" on public.audit_logs;

create policy "audit_logs_own_rows" on public.audit_logs
  for all to authenticated using ((select auth.uid())::text = user_key)
  with check ((select auth.uid())::text = user_key);

revoke all privileges on public.audit_logs from anon;
grant select, insert, update, delete on public.audit_logs to authenticated;
