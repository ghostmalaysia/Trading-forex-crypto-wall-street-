-- Supabase cloud memory schema for TradeWall MVP
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_key text not null unique, -- anonymous/browser key for MVP; replace with auth.uid() later
  display_name text,
  preferences jsonb not null default '{"theme":"dark","default_symbol":"BTC/USD","timeframe":"1D"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  symbol text not null,
  market text not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_key, symbol)
);

create table if not exists public.ai_memory (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  role text not null check (role in ('user','ai','system')),
  content text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  symbol text not null,
  condition text not null,
  threshold numeric not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_watchlists_user_key on public.watchlists(user_key);
create index if not exists idx_ai_memory_user_key_created on public.ai_memory(user_key, created_at desc);
create index if not exists idx_alerts_user_key_active on public.alerts(user_key, active);

-- MVP: permissive anon policies for demo. Tighten with Supabase Auth before production.
alter table public.user_profiles enable row level security;
alter table public.watchlists enable row level security;
alter table public.ai_memory enable row level security;
alter table public.alerts enable row level security;

create policy "anon_profiles_mvp" on public.user_profiles for all to anon using (true) with check (true);
create policy "anon_watchlists_mvp" on public.watchlists for all to anon using (true) with check (true);
create policy "anon_ai_memory_mvp" on public.ai_memory for all to anon using (true) with check (true);
create policy "anon_alerts_mvp" on public.alerts for all to anon using (true) with check (true);
