-- Supabase cloud memory schema for TradeWall MVP
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_key text not null unique, -- Supabase Auth user UUID stored as text; RLS verifies it against auth.uid()
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

-- Authenticated users can access only rows whose user_key matches their Auth UUID.
alter table public.user_profiles enable row level security;
alter table public.watchlists enable row level security;
alter table public.ai_memory enable row level security;
alter table public.alerts enable row level security;

drop policy if exists "anon_profiles_mvp" on public.user_profiles;
drop policy if exists "anon_watchlists_mvp" on public.watchlists;
drop policy if exists "anon_ai_memory_mvp" on public.ai_memory;
drop policy if exists "anon_alerts_mvp" on public.alerts;
drop policy if exists "profiles_own_rows" on public.user_profiles;
drop policy if exists "watchlists_own_rows" on public.watchlists;
drop policy if exists "ai_memory_own_rows" on public.ai_memory;
drop policy if exists "alerts_own_rows" on public.alerts;

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
