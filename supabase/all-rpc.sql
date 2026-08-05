-- ===========================================================================
-- Stories Resto Cafe — Secure Menu Insert RPC
-- Run this in the Supabase SQL editor so the kitchen can add new menu items.
-- ===========================================================================

-- Create a secure RPC function to insert a new menu item.
create or replace function insert_menu_item_secure(
  p_pin text,
  p_id text,
  p_category text,
  p_title_en text,
  p_title_ar text,
  p_description_en text,
  p_description_ar text,
  p_price numeric,
  p_image text,
  p_not_served_windows jsonb,
  p_is_available boolean,
  p_modifiers jsonb
) returns void language plpgsql security definer as $$
begin
  -- Validate the PIN
  if p_pin != (select value from public.app_config where key = 'kitchen_pin') then
    raise exception 'Invalid PIN';
  end if;

  -- Prevent duplicate ids
  if exists (select 1 from public.menu where id = p_id) then
    raise exception 'An item with this id already exists';
  end if;

  -- Perform the insert
  insert into public.menu (
    id, category, title_en, title_ar, description_en, description_ar,
    price, image, not_served_windows, is_available, modifiers
  ) values (
    p_id, p_category, p_title_en, p_title_ar, p_description_en, p_description_ar,
    p_price, p_image, p_not_served_windows, p_is_available, p_modifiers
  );
end;
$$;


-- ============================================================

-- ===========================================================================
-- Stories Resto Cafe — Secure Category Insert RPC
-- Run this in the Supabase SQL editor so the kitchen can add new categories.
-- ===========================================================================

-- Create a secure RPC function to insert a new category.
create or replace function insert_category_secure(
  p_pin text,
  p_id text,
  p_label_en text,
  p_label_ar text
) returns void language plpgsql security definer as $$
declare
  v_sort integer;
begin
  -- Validate the PIN
  if p_pin != (select value from public.app_config where key = 'kitchen_pin') then
    raise exception 'Invalid PIN';
  end if;

  -- Prevent duplicate ids
  if exists (select 1 from public.categories where id = p_id) then
    raise exception 'A category with this id already exists';
  end if;

  -- Append at the end of the category list
  select coalesce(max(sort_order), 0) + 1 into v_sort from public.categories;

  insert into public.categories (id, label_en, label_ar, sort_order)
  values (p_id, p_label_en, p_label_ar, v_sort);
end;
$$;


-- ============================================================

-- ===========================================================================
-- Stories Resto Cafe — Secure Category Delete RPC
-- Run this in the Supabase SQL editor so the kitchen can remove categories.
-- Deletes the category and every menu item assigned to it.
-- ===========================================================================

create or replace function delete_category_secure(
  p_pin text,
  p_id text
) returns void language plpgsql security definer as $$
begin
  -- Validate the PIN
  if p_pin != (select value from public.app_config where key = 'kitchen_pin') then
    raise exception 'Invalid PIN';
  end if;

  -- Remove items first, then the category (avoids FK violations).
  delete from public.menu where category = p_id;
  delete from public.categories where id = p_id;
end;
$$;


-- ============================================================

create or replace function clear_table_orders_secure(
  p_pin text,
  p_table_number text
) returns void language plpgsql security definer as $$
begin
  if p_pin != (select value from public.app_config where key = 'kitchen_pin') then
    raise exception 'Invalid PIN';
  end if;
  delete from public.orders where table_number = p_table_number;
end;
$$;


-- ============================================================

-- Ensure the orders table has a "paid" flag.
alter table public.orders
  add column if not exists paid boolean not null default false;

create or replace function mark_order_paid_secure(
  p_pin text,
  p_order_id text
) returns void language plpgsql security definer as $$
begin
  if p_pin != (select value from public.app_config where key = 'kitchen_pin') then
    raise exception 'Invalid PIN';
  end if;
  update public.orders set paid = true where id = p_order_id::uuid;
end;
$$;


-- ============================================================

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
