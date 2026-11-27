create table if not exists public.paper_orders (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  order_ref text not null,
  symbol text not null,
  side text not null,
  payload jsonb not null,
  status text not null default 'simulated',
  pnl numeric,
  outcome text,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  order_ref text,
  symbol text not null,
  rating smallint,
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_paper_orders_user_key_created on public.paper_orders(user_key, created_at desc);
create index if not exists idx_ai_evaluations_user_key_created on public.ai_evaluations(user_key, created_at desc);

alter table public.paper_orders enable row level security;
alter table public.ai_evaluations enable row level security;

drop policy if exists "paper_orders_own_rows" on public.paper_orders;
drop policy if exists "ai_evaluations_own_rows" on public.ai_evaluations;

create policy "paper_orders_own_rows" on public.paper_orders
  for all to authenticated using ((select auth.uid())::text = user_key)
  with check ((select auth.uid())::text = user_key);
create policy "ai_evaluations_own_rows" on public.ai_evaluations
  for all to authenticated using ((select auth.uid())::text = user_key)
  with check ((select auth.uid())::text = user_key);

revoke all privileges on public.paper_orders, public.ai_evaluations from anon;
grant select, insert, update, delete on public.paper_orders, public.ai_evaluations to authenticated;
