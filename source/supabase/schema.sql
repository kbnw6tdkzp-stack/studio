-- Run this in the SQL editor of the Supabase project you want to use.
create table if not exists public.designs (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.designs enable row level security;
create policy "own designs select" on public.designs for select using (auth.uid() = user_id);
create policy "own designs insert" on public.designs for insert with check (auth.uid() = user_id);
create policy "own designs update" on public.designs for update using (auth.uid() = user_id);
create policy "own designs delete" on public.designs for delete using (auth.uid() = user_id);
