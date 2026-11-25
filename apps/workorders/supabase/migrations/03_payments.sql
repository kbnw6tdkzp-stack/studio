-- Card payments through Stripe. You send a pay link (or show a QR code); the customer pays on
-- Stripe's checkout; Stripe tells our server (webhook), which records the payment.
-- Only Stripe's confirmation can mark something paid.

create table if not exists public.pay_requests (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  token_hash text not null unique,
  document jsonb not null,                 -- the invoice as the customer sees it
  amount numeric(12,2) not null check (amount > 0),   -- balance due when the link was made
  card_fee numeric(12,2) not null default 0 check (card_fee >= 0),
  card_fee_pct numeric(5,2) not null default 0,
  return_url text not null,
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  stripe_session_id text,
  paid_at timestamptz,
  viewed_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pay_requests_business_updated on public.pay_requests(business_id, updated_at);
create index if not exists pay_requests_work_order on public.pay_requests(work_order_id);

create table if not exists public.card_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  pay_request_id uuid references public.pay_requests(id) on delete set null,
  stripe_session_id text not null unique,
  amount numeric(12,2) not null,           -- everything charged, card fee included
  fee numeric(12,2) not null default 0,    -- the card fee part
  fee_pct numeric(5,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists card_payments_business_created on public.card_payments(business_id, created_at);

create or replace function public.guard_pay_request()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.token_hash := old.token_hash; new.document := old.document; new.amount := old.amount;
    new.card_fee := old.card_fee; new.card_fee_pct := old.card_fee_pct; new.return_url := old.return_url;
    new.work_order_id := old.work_order_id; new.business_id := old.business_id; new.created_at := old.created_at;
    if current_user <> 'postgres' then
      -- From the app you can only cancel a pending link.
      if old.status <> 'pending' or new.status <> 'cancelled' then new.status := old.status; end if;
      new.stripe_session_id := old.stripe_session_id; new.paid_at := old.paid_at;
    end if;
  end if;
  return new;
end $$;
create trigger guard before insert or update on public.pay_requests
  for each row execute function public.guard_pay_request();

alter table public.pay_requests enable row level security;
alter table public.card_payments enable row level security;
create policy "members read" on public.pay_requests for select using (business_id in (select public.my_business_ids()));
create policy "members create" on public.pay_requests for insert
  with check (business_id in (select public.my_business_ids()) and status = 'pending' and stripe_session_id is null);
create policy "members cancel" on public.pay_requests for update
  using (business_id in (select public.my_business_ids())) with check (business_id in (select public.my_business_ids()));
create policy "members read" on public.card_payments for select using (business_id in (select public.my_business_ids()));

-- Public: what the customer's pay page shows.
create or replace function public.get_pay_request(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r public.pay_requests;
begin
  select * into r from public.pay_requests
    where token_hash = encode(extensions.digest(convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'), 'hex');
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if r.status = 'cancelled' then return jsonb_build_object('error', 'cancelled'); end if;
  if r.status = 'pending' and r.expires_at < now() then return jsonb_build_object('error', 'expired'); end if;
  if r.viewed_at is null then update public.pay_requests set viewed_at = now() where id = r.id; end if;
  return jsonb_build_object('status', r.status, 'document', r.document, 'amount', r.amount, 'card_fee', r.card_fee,
    'card_fee_pct', r.card_fee_pct, 'total', r.amount + r.card_fee, 'paid_at', r.paid_at);
end $$;
grant execute on function public.get_pay_request(text) to anon, authenticated;

-- Called only by the Stripe webhook (server key). Records the payment on the work order.
create or replace function public.record_card_payment(p_request uuid, p_session text, p_amount_cents bigint)
returns text language plpgsql security definer set search_path = public as $$
declare r public.pay_requests; pid uuid := gen_random_uuid(); paid numeric(12,2) := p_amount_cents / 100.0; fee numeric(12,2);
begin
  if coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') <> 'service_role' then
    raise exception 'not allowed';
  end if;
  select * into r from public.pay_requests where id = p_request for update;
  if not found then return 'no_request'; end if;
  if exists (select 1 from public.card_payments where stripe_session_id = p_session) then return 'duplicate'; end if;
  fee := least(r.card_fee, paid);
  insert into public.card_payments (id, business_id, work_order_id, pay_request_id, stripe_session_id, amount, fee, fee_pct)
    values (pid, r.business_id, r.work_order_id, r.id, p_session, paid, fee, r.card_fee_pct);
  update public.work_orders w set
    data = jsonb_set(jsonb_set(w.data,
      '{fees}', coalesce(w.data->'fees', '[]'::jsonb) || case when fee > 0 then jsonb_build_array(jsonb_build_object(
        'id', 'fee-' || pid, 'name', 'Card processing fee (' || trim_scale(r.card_fee_pct) || '%)', 'amount', fee, 'taxable', false, 'card', true))
        else '[]'::jsonb end),
      '{payments}', coalesce(w.data->'payments', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'id', pid::text, 'amount', paid, 'method', 'Card (Stripe)', 'date', now(), 'note', 'Paid online'))),
    subtotal = w.subtotal + fee,
    total = w.total + fee,
    amount_paid = w.amount_paid + paid,
    status = case when w.amount_paid + paid >= w.total + fee - 0.005 and w.status <> 'void' then 'paid' else w.status end,
    paid_at = case when w.amount_paid + paid >= w.total + fee - 0.005 then coalesce(w.paid_at, now()) else w.paid_at end
  where w.id = r.work_order_id;
  update public.pay_requests set status = 'paid', stripe_session_id = p_session, paid_at = now() where id = r.id;
  return 'recorded';
end $$;
