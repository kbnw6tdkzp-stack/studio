-- Remote signing links: you text the customer a link, they review and sign on their phone.
-- The link holds a random token; only its SHA-256 is stored here.

create table if not exists public.sign_requests (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  kind text not null check (kind in ('diagnosis','repair','completion')),
  token_hash text not null unique,
  document jsonb not null,
  status text not null default 'pending' check (status in ('pending','signed','cancelled')),
  signature_id uuid,
  expires_at timestamptz not null default now() + interval '14 days',
  viewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sign_requests_business_updated on public.sign_requests(business_id, updated_at);
create index if not exists sign_requests_work_order on public.sign_requests(work_order_id);

alter table public.signatures add column if not exists signer_ip text not null default '';
alter table public.signatures add column if not exists sign_request_id uuid references public.sign_requests(id) on delete set null;

-- Once a request is signed or cancelled it stays that way, and what was sent can't be edited.
create or replace function public.guard_sign_request()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.token_hash := old.token_hash;
    new.document := old.document;
    new.kind := old.kind;
    new.work_order_id := old.work_order_id;
    new.business_id := old.business_id;
    new.created_at := old.created_at;
    if old.status <> 'pending' then
      new.status := old.status;
      new.signature_id := old.signature_id;
    elsif new.status = 'signed' and current_user <> 'postgres' then
      new.status := old.status;  -- only the signing function can mark it signed
    end if;
  end if;
  return new;
end $$;
create trigger guard before insert or update on public.sign_requests
  for each row execute function public.guard_sign_request();

alter table public.sign_requests enable row level security;
create policy "members read" on public.sign_requests for select
  using (business_id in (select public.my_business_ids()));
create policy "members create" on public.sign_requests for insert
  with check (business_id in (select public.my_business_ids()) and status = 'pending');
create policy "members cancel" on public.sign_requests for update
  using (business_id in (select public.my_business_ids()))
  with check (business_id in (select public.my_business_ids()));

-- Public: the customer's link. Returns only what was sent for signing.
create or replace function public.get_sign_request(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r public.sign_requests; sig jsonb;
begin
  select * into r from public.sign_requests
    where token_hash = encode(extensions.digest(convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'), 'hex');
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if r.status = 'cancelled' then return jsonb_build_object('error', 'cancelled'); end if;
  if r.status = 'pending' and r.expires_at < now() then return jsonb_build_object('error', 'expired'); end if;
  if r.viewed_at is null then
    update public.sign_requests set viewed_at = now() where id = r.id;
  end if;
  if r.signature_id is not null then
    select jsonb_build_object('signer_name', s.signer_name, 'image', s.image, 'signed_at', s.signed_at, 'snapshot_hash', s.snapshot_hash)
      into sig from public.signatures s where s.id = r.signature_id;
  end if;
  return jsonb_build_object('status', r.status, 'kind', r.kind, 'document', r.document, 'expires_at', r.expires_at, 'signature', sig);
end $$;

-- Public: the customer signs. The database builds the record, so what they agreed to can't be altered.
create or replace function public.submit_sign_request(p_token text, p_name text, p_image text, p_user_agent text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r public.sign_requests; sid uuid := gen_random_uuid(); t timestamptz := now(); ip text; snap jsonb;
begin
  select * into r from public.sign_requests
    where token_hash = encode(extensions.digest(convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'), 'hex')
    for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if r.status <> 'pending' then return public.get_sign_request(p_token); end if;
  if r.expires_at < now() then return jsonb_build_object('error', 'expired'); end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 200 then return jsonb_build_object('error', 'name'); end if;
  if p_image is null or p_image not like 'data:image/png;base64,%' or length(p_image) > 600000 then
    return jsonb_build_object('error', 'signature');
  end if;
  ip := trim(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1));
  snap := jsonb_build_object(
    'kind', r.kind, 'label', r.document->>'label', 'signer_name', trim(p_name), 'signed_at', t,
    'terms', r.document->'terms', 'amount', r.document->'amount', 'document', r.document->'doc',
    'method', 'remote', 'ip', ip, 'user_agent', left(coalesce(p_user_agent, ''), 500), 'request_id', r.id);
  insert into public.signatures (id, business_id, work_order_id, kind, signer_name, image, snapshot, snapshot_hash,
                                 method, user_agent, signed_at, created_at, signer_ip, sign_request_id)
  values (sid, r.business_id, r.work_order_id, r.kind, trim(p_name), p_image, snap,
          encode(extensions.digest(convert_to(snap::text, 'UTF8'), 'sha256'), 'hex'),
          'remote', left(coalesce(p_user_agent, ''), 500), t, t, ip, r.id);
  update public.sign_requests set status = 'signed', signature_id = sid where id = r.id;
  update public.work_orders set status = case
      when r.kind = 'diagnosis' and status = 'draft' then 'diag_authorized'
      when r.kind = 'repair' and status in ('draft', 'diag_authorized', 'estimate') then 'approved'
      else status end
    where id = r.work_order_id;
  return public.get_sign_request(p_token);
end $$;

grant execute on function public.get_sign_request(text) to anon, authenticated;
grant execute on function public.submit_sign_request(text, text, text, text) to anon, authenticated;
