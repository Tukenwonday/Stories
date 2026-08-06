-- ===========================================================================
-- Stories Resto Cafe - Table token lookup (server-side)
-- Run this in the Supabase SQL editor to stop exposing tables.json publicly.
--
-- The table below is protected by RLS with NO select policies, so the full
-- token list can never be downloaded via the API. The storefront only calls
-- resolve_table_token(), which resolves a token you already have (from a QR).
-- ===========================================================================

create table if not exists public.table_tokens (
  token text primary key,
  table_number text not null
);

-- Block all direct reads (anon + authenticated) of the token list.
alter table public.table_tokens enable row level security;

insert into public.table_tokens (token, table_number) values
  ('2973e27c-614a-4fdd-86fd-75215ab3bd3f', '01'),
  ('bba70a75-2396-497c-a44f-d1164eb8ae37', '02'),
  ('69167c2e-1167-47d8-84b7-df35649fe0ec', '03'),
  ('0d565f13-93ef-424b-bf5d-dcd9b678b5f9', '04'),
  ('6b9fdaf9-08e9-4dae-9df6-4e7222e18a4e', '05'),
  ('9fa109ca-b5d8-449b-9011-23fafe8a0404', '06'),
  ('3b851ee2-8179-400a-b83a-41f7caaf6816', '07'),
  ('08f6bc32-bc0e-46cc-bd8e-140be45e4a31', '08'),
  ('1a46f12c-907e-41d8-9a3a-652298790f84', '09'),
  ('98f03dd1-d527-431f-9b45-cc3f18fd51a7', '10'),
  ('9e6742bb-90b8-46a0-afcc-ec94387f9698', '11'),
  ('626a2c46-25f3-4da6-8b74-132b502ea34c', '12'),
  ('1d920cd7-4e9a-4fcb-aa7b-1f8acfad09b6', '13'),
  ('5bfc697e-fddb-40e6-bb2c-0d20cded5c9c', '14'),
  ('6e3c3b14-831a-4373-ba28-72845671dc1e', '15')
on conflict (token) do nothing;

-- Security definer: runs as the table owner, bypasses RLS, so it can look up
-- a single token. Returns NULL when the token is unknown.
create or replace function resolve_table_token(p_token text)
returns text
language sql
security definer
stable
as $$
  select table_number from public.table_tokens where token = p_token;
$$;
