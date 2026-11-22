-- Work Orders app schema. Safe to run more than once.
-- To apply by hand: Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
-- Every row belongs to a business. Row Level Security (RLS) makes sure a signed-in
-- user only ever sees rows for businesses they belong to, on every device.
-- Ids are generated on the device (uuid) so records can be created offline and
-- synced later without clashing.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- businesses
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  industry text not null default 'automotive',
  name text not null default '',
  legal_name text not null default '',          -- e.g. "Jaime's Mobile Repair LLC"
  entity_type text not null default 'sole_proprietor', -- sole_proprietor | llc | corporation | partnership
  license_number text not null default '',      -- e.g. BAR / state license
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  website text not null default '',
  logo_path text,                                -- path in the "logos" storage bucket
  settings jsonb not null default '{}'::jsonb,   -- rates, tax presets, fees, terms, numbering format
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  primary key (business_id, user_id)
);

-- Businesses the current user belongs to. security definer so policies can use it
-- without recursive RLS checks.
create or replace function public.my_business_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select business_id from public.business_members where user_id = auth.uid()
$$;

-- When a business is created, its creator becomes the owner member, and it gets
-- a work order counter.
create or replace function public.on_business_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.business_members(business_id, user_id, role)
  values (new.id, new.owner_id, 'owner') on conflict do nothing;
  insert into public.wo_counters(business_id, next_value)
  values (new.id, 1) on conflict do nothing;
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  title text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- numbering
-- One counter row per business. The number is handed out by the database in a
-- single locked step, so two devices can never get the same number and numbers
-- never jump around. Numbers are never reused, even if an order is voided.
create table if not exists public.wo_counters (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  next_value integer not null default 1 check (next_value > 0)
);

drop trigger if exists business_created on public.businesses;
create trigger business_created after insert on public.businesses
  for each row execute function public.on_business_created();

-- ---------------------------------------------------------------- customers
create table if not exists public.customers (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null default '',
  company text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists customers_business_updated on public.customers(business_id, updated_at);

-- ---------------------------------------------------------------- vehicles (assets)
-- Called "assets" in other trades later; vehicle fields are first-class for now,
-- and "details" holds anything extra.
create table if not exists public.vehicles (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  vin text not null default '',
  year text not null default '',
  make text not null default '',
  model text not null default '',
  trim text not null default '',
  engine text not null default '',
  color text not null default '',
  plate text not null default '',
  mileage text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists vehicles_business_updated on public.vehicles(business_id, updated_at);

-- ---------------------------------------------------------------- work orders
create table if not exists public.work_orders (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  number integer,                                -- assigned by the database, see trigger
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  status text not null default 'draft',
    -- draft | diag_authorized | estimate | approved | in_progress | completed | paid | void
  data jsonb not null default '{}'::jsonb,       -- complaint, diagnosis, jobs, fees, tax, terms
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  parts_cost numeric(12,2) not null default 0,   -- your cost, never shown to customers
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (business_id, number)
);
create index if not exists work_orders_business_updated on public.work_orders(business_id, updated_at);

create or replace function public.assign_work_order_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if tg_op = 'INSERT' then
    -- An upsert (insert ... on conflict update) fires this INSERT trigger even
    -- when the row already exists and it ends up being an update. Never spend a
    -- number on that: keep the existing one.
    select number into n from public.work_orders where id = new.id;
    if found then
      new.number := n;
      return new;
    end if;
    -- Lock this business's counter row, take the value, bump it. Atomic.
    insert into public.wo_counters(business_id, next_value) values (new.business_id, 1)
      on conflict (business_id) do nothing;
    update public.wo_counters set next_value = next_value + 1
      where business_id = new.business_id
      returning next_value - 1 into n;
    new.number := n;
  else
    -- A number can never be changed once given.
    new.number := old.number;
    new.business_id := old.business_id;
  end if;
  return new;
end $$;

drop trigger if exists work_orders_number on public.work_orders;
create trigger work_orders_number before insert or update on public.work_orders
  for each row execute function public.assign_work_order_number();

-- Lets the owner choose where numbering starts (e.g. continue from 157), but
-- never below a number already used, so duplicates are impossible.
create or replace function public.set_next_work_order_number(p_business uuid, p_next integer)
returns integer language plpgsql security definer set search_path = public as $$
declare used integer;
begin
  if p_business not in (select public.my_business_ids()) then
    raise exception 'not allowed';
  end if;
  select coalesce(max(number), 0) into used from public.work_orders where business_id = p_business;
  if p_next <= used then
    raise exception 'Next number must be greater than %, the highest number already used', used;
  end if;
  insert into public.wo_counters(business_id, next_value) values (p_business, p_next)
    on conflict (business_id) do update set next_value = excluded.next_value;
  return p_next;
end $$;

create or replace function public.get_next_work_order_number(p_business uuid)
returns integer language sql stable security definer set search_path = public as $$
  select next_value from public.wo_counters
  where business_id = p_business and p_business in (select public.my_business_ids())
$$;

-- ---------------------------------------------------------------- signatures
-- Signed records are permanent: they can be added, never edited or deleted.
create table if not exists public.signatures (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  kind text not null,                 -- diagnosis | repair | completion
  signer_name text not null,
  image text not null,                -- PNG data URL of the signature
  snapshot jsonb not null,            -- exactly what was agreed to: terms, amounts, vehicle
  snapshot_hash text not null,        -- SHA-256 of snapshot, proves it wasn't altered
  method text not null default 'in_person', -- in_person | remote
  user_agent text not null default '',
  signed_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists signatures_business_created on public.signatures(business_id, created_at);

-- ---------------------------------------------------------------- updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['businesses','profiles','customers','vehicles','work_orders'] loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.profiles enable row level security;
alter table public.wo_counters enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.work_orders enable row level security;
alter table public.signatures enable row level security;

drop policy if exists "members read" on public.businesses;
create policy "members read" on public.businesses for select
  using (id in (select public.my_business_ids()) or owner_id = auth.uid());
drop policy if exists "owner creates" on public.businesses;
create policy "owner creates" on public.businesses for insert with check (owner_id = auth.uid());
drop policy if exists "members update" on public.businesses;
create policy "members update" on public.businesses for update
  using (id in (select public.my_business_ids())) with check (id in (select public.my_business_ids()));

drop policy if exists "see own memberships" on public.business_members;
create policy "see own memberships" on public.business_members for select using (user_id = auth.uid());

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- wo_counters: no policies, so clients can't touch it directly; only the
-- security definer functions above can.

do $$ declare t text; begin
  foreach t in array array['customers','vehicles','work_orders'] loop
    execute format('drop policy if exists "members all" on public.%I', t);
    execute format($p$create policy "members all" on public.%I for all
      using (business_id in (select public.my_business_ids()))
      with check (business_id in (select public.my_business_ids()))$p$, t);
  end loop;
end $$;

drop policy if exists "members read" on public.signatures;
create policy "members read" on public.signatures for select
  using (business_id in (select public.my_business_ids()));
drop policy if exists "members add" on public.signatures;
create policy "members add" on public.signatures for insert
  with check (business_id in (select public.my_business_ids()));

revoke execute on function public.set_next_work_order_number(uuid, integer) from anon, public;
revoke execute on function public.get_next_work_order_number(uuid) from anon, public;
grant execute on function public.set_next_work_order_number(uuid, integer) to authenticated;
grant execute on function public.get_next_work_order_number(uuid) to authenticated;

-- ---------------------------------------------------------------- storage: logos
insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
  on conflict (id) do nothing;
-- Files live under "<business_id>/..." and only members of that business can write.
drop policy if exists "logo write" on storage.objects;
create policy "logo write" on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1]::uuid in (select public.my_business_ids()));
drop policy if exists "logo update" on storage.objects;
create policy "logo update" on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1]::uuid in (select public.my_business_ids()));
drop policy if exists "logo delete" on storage.objects;
create policy "logo delete" on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1]::uuid in (select public.my_business_ids()));
