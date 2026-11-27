-- A separate number for texts, for customers whose main phone is a house line.
alter table public.customers add column if not exists mobile text not null default '';
