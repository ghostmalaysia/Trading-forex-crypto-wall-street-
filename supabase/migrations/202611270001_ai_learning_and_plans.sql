begin;

create table if not exists public.ai_learning (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  insight text not null,
  source text not null default 'feedback',
  rating smallint,
  created_at timestamptz not null default now()
);

create table if not exists public.trade_plans (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  symbol text not null,
  timeframe text not null,
  proposal jsonb not null,
  risk jsonb not null,
  decision text not null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_learning_user_key_created on public.ai_learning(user_key, created_at desc);
create index if not exists idx_trade_plans_user_key_created on public.trade_plans(user_key, created_at desc);

alter table public.ai_learning enable row level security;
alter table public.trade_plans enable row level security;

drop policy if exists "ai_learning_own_rows" on public.ai_learning;
drop policy if exists "trade_plans_own_rows" on public.trade_plans;

create policy "ai_learning_own_rows" on public.ai_learning
  for all to authenticated using ((select auth.uid())::text = user_key)
  with check ((select auth.uid())::text = user_key);
create policy "trade_plans_own_rows" on public.trade_plans
  for all to authenticated using ((select auth.uid())::text = user_key)
  with check ((select auth.uid())::text = user_key);

revoke all privileges on public.ai_learning, public.trade_plans from anon;
grant select, insert, update, delete on public.ai_learning, public.trade_plans to authenticated;

commit;
