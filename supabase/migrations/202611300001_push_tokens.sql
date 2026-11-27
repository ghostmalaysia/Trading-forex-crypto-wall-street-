create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  token text not null,
  platform text not null default 'expo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_key, token)
);

create index if not exists idx_push_tokens_user_key_created on public.push_tokens(user_key, created_at desc);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_own_rows" on public.push_tokens;

create policy "push_tokens_own_rows" on public.push_tokens
  for all to authenticated using ((select auth.uid())::text = user_key)
  with check ((select auth.uid())::text = user_key);

revoke all privileges on public.push_tokens from anon;
grant select, insert, update, delete on public.push_tokens to authenticated;
