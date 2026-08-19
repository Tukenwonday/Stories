-- =============================================================================
-- Stories Resto Cafe — Single Source of Truth for the Database
-- =============================================================================
-- Run this file ONCE in the Supabase SQL editor. It is idempotent (safe to
-- re-run): tables use CREATE TABLE IF NOT EXISTS, functions use
-- CREATE OR REPLACE, and policies are dropped before being recreated.
--
-- Contents:
--   1. Extensions (pgcrypto)
--   2. Tables (categories, menu, orders, table_tokens, app_config)
--   3. Indexes
--   4. Row Level Security policies
--   5. Storage bucket + policies (menu-images)
--   6. RPC functions (all server-authoritative, PIN / token gated)
--   7. Seed data (table tokens, kitchen PIN)
--
-- The schema below matches the LIVE production database, verified against
-- the deployed OpenAPI surface (see src/lib/supabase.ts for the exact
-- columns and RPC arguments the frontend uses).
-- =============================================================================

-- =============================================================================
-- 0. EXTENSIONS
-- =============================================================================

-- pgcrypto removed (no longer needed for plain-text PIN)

-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- Categories (menu sections shown as tabs in the storefront).
create table if not exists public.categories (
  id         text primary key,
  label_en   text not null,
  label_ar   text not null,
  sort_order integer not null default 0
);

-- Menu items. `price` is the authoritative server-side price; the order RPC
-- recalculates every line from this column, never from the client.
create table if not exists public.menu (
  id                text primary key,
  category          text not null references public.categories(id),
  title_en          text not null,
  title_ar          text not null,
  description_en    text not null,
  description_ar    text not null,
  price             numeric not null,
  image             text,
  tag_en            text,
  tag_ar            text,
  modifiers         jsonb not null default '[]'::jsonb,
  -- Legacy columns present in production but not used by the current frontend.
  available_from    time,
  available_to      time,
  created_at        timestamptz not null default now(),
  is_available      boolean not null default true,
  unavailable_dates date[] not null default '{}',
  not_served_windows jsonb not null default '[]'::jsonb
);

-- Orders. Written ONLY through the submit_order_secure RPC (never directly by
-- the client). `status` defaults to 'pending'; the kitchen reads it as-is.
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  table_number   text not null,
  customer_name  text not null,
  notes          text not null default '',
  payment_method text not null default 'waiter',
  items          jsonb not null,
  total          numeric not null,
  status         text not null default 'pending',
  paid           boolean not null default false
);

-- Realtime delivers the FULL old row on DELETE/UPDATE events so the checkout
-- dashboard's DELETE handler can read payload.old.table_number. Without this,
-- DELETE events only carry the primary key.
alter table public.orders replica identity full;

-- Secret QR tokens that map to a table number. RLS blocks all direct reads so
-- the full list can never be downloaded; only resolve_table_token() can look
-- up a single token the client already possesses.
create table if not exists public.table_tokens (
  token        text primary key,
  table_number text not null
);

-- Key/value config. The kitchen PIN lives here and is checked inside the
-- security-definer RPCs, so it never travels to the client.
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);

-- =============================================================================
-- 2. INDEXES
-- =============================================================================

create index if not exists idx_menu_category  on public.menu(category);
create index if not exists idx_orders_table   on public.orders(table_number);
create index if not exists idx_orders_created on public.orders(created_at);
create index if not exists idx_orders_status_created on public.orders(status, created_at);
create index if not exists idx_orders_paid on public.orders(paid) where paid = false;
create index if not exists idx_orders_table_created on public.orders(table_number, created_at desc);

-- =============================================================================
-- 3. ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on every table.
alter table public.categories    enable row level security;
alter table public.menu          enable row level security;
alter table public.orders        enable row level security;
alter table public.table_tokens  enable row level security;
alter table public.app_config    enable row level security;

-- categories: public read (storefront menu).
drop policy if exists "categories public read" on public.categories;
create policy "categories public read" on public.categories
  for select using (true);

-- menu: public read (storefront menu).
drop policy if exists "menu public read" on public.menu;
create policy "menu public read" on public.menu
  for select using (true);

-- orders: public READ only (the kitchen and checkout dashboards read orders
-- with the anon key). There are deliberately NO insert/update/delete policies:
-- RLS therefore denies every direct write, so the ONLY way to create, clear or
-- mark-paid an order is through the PIN/token-gated RPCs below. Any pre-existing
-- permissive policy is dropped to close the direct-UPDATE/DELETE hole.
drop policy if exists "orders public insert"  on public.orders;
drop policy if exists "orders public update"  on public.orders;
drop policy if exists "orders public delete"  on public.orders;
drop policy if exists "orders public read"    on public.orders;
create policy "orders public read" on public.orders
  for select using (true);

-- table_tokens: no policies -> fully blocked (token resolution is via RPC).
drop policy if exists "table_tokens public read" on public.table_tokens;
drop policy if exists "table_tokens no access"   on public.table_tokens;
create policy "table_tokens no access" on public.table_tokens
  for all using (false);

-- app_config: no policies -> fully blocked (PIN checked inside RPCs only).
drop policy if exists "app_config public read" on public.app_config;
drop policy if exists "app_config no access"   on public.app_config;
create policy "app_config no access" on public.app_config
  for all using (false);

-- =============================================================================
-- 4. STORAGE BUCKET + POLICIES (menu-images)
-- =============================================================================

-- Public bucket with a 5 MB file cap (matches the client-side upload path in
-- src/lib/upload.ts). Safe to re-run; re-applies the public flag.
-- Cache-Control: public, max-age=31536000, immutable (set via Dashboard > Storage > menu-images > Settings)
insert into storage.buckets (id, name, public, file_size_limit)
values ('menu-images', 'menu-images', true, 5242880)
on conflict (id) do update set public = true;

-- The storefront/kitchen uploads photos with the anon key, so objects in this
-- bucket are readable by everyone and writable by anyone holding the anon key
-- (the kitchen PIN gates uploads in the app UI).
-- UPDATE and DELETE are blocked for anon — overwrites are never safe, and
-- deletes go through the delete-storage-object Edge Function instead.
drop policy if exists "menu-images select" on storage.objects;
create policy "menu-images select" on storage.objects
  for select using (bucket_id = 'menu-images');

drop policy if exists "menu-images insert" on storage.objects;
create policy "menu-images insert" on storage.objects
  for insert to anon
  with check (
    bucket_id = 'menu-images'
    and lower(split_part(name, '.', -1)) in ('webp', 'jpg', 'png', 'gif', 'avif')
    and lower(coalesce(metadata->>'mimetype', '')) in ('image/webp', 'image/jpeg', 'image/png', 'image/gif', 'image/avif')
  );

drop policy if exists "menu-images update" on storage.objects;

drop policy if exists "menu-images delete" on storage.objects;

-- =============================================================================
-- 5. RPC FUNCTIONS
-- =============================================================================
-- All functions below are SECURITY DEFINER (run as the table owner, bypassing
-- RLS) so they can touch protected tables while still being callable by the
-- anon key. Each one is gated by a table token or the kitchen PIN.

-- ---------------------------------------------------------------------------
-- cleanup_old_orders() -> void
-- Removes paid orders older than 14 days. Run via pg_cron daily.
-- 14 days keeps ~350 MB of order history at 300k orders/mo, safely under the
-- 500 MB Supabase free-tier cap.
-- ---------------------------------------------------------------------------
create or replace function cleanup_old_orders()
returns void language plpgsql security definer as $$
begin
  delete from public.orders
  where paid = true
    and created_at < now() - interval '14 days';
end;
$$;

-- Schedule cleanup_old_orders() to run daily at 03:00 UTC via pg_cron.
-- Idempotent: any existing job with this name is unscheduled before recreating.
create extension if not exists pg_cron;
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'cleanup-old-orders';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end;
$$;
select cron.schedule('cleanup-old-orders', '0 3 * * *', $$select public.cleanup_old_orders()$$);

-- ---------------------------------------------------------------------------
-- resolve_table_token(text) -> text
-- Resolves a QR token to its table number. Returns NULL for unknown tokens.
-- Used by the storefront (src/lib/supabase.ts) to authorize a table session.
-- ---------------------------------------------------------------------------
create or replace function resolve_table_token(p_token text)
returns text
language sql
security definer
stable
as $$
  select table_number from public.table_tokens where token = p_token;
$$;

-- ---------------------------------------------------------------------------
-- list_table_numbers() -> text[]
-- Returns every table number (never the tokens, which stay hidden behind RLS)
-- so staff dashboards can render a dynamic table grid instead of a hardcoded
-- count. Adding a table = inserting one token row; no code changes needed.
-- ---------------------------------------------------------------------------
create or replace function list_table_numbers()
returns text[]
language sql
security definer
stable
as $$
  select array_agg(table_number order by table_number::int)
  from public.table_tokens;
$$;

-- ---------------------------------------------------------------------------
-- verify_kitchen_pin(text) -> boolean
-- Compares the submitted PIN against the stored value in app_config.
-- Used by the kitchen and checkout dashboards to unlock staff screens.
-- ---------------------------------------------------------------------------
create or replace function verify_kitchen_pin(p_pin text)
returns boolean
language plpgsql
security definer
as $$
begin
  if p_pin = (select value from public.app_config where key = 'kitchen_pin') then
    return true;
  end if;
  perform pg_sleep(1);
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_kitchen_pin(text, text) -> boolean
-- Updates the kitchen PIN. Verifies old PIN, stores new PIN as plain text.
-- ---------------------------------------------------------------------------
create or replace function update_kitchen_pin(p_old_pin text, p_new_pin text)
returns boolean
language plpgsql
security definer
as $$
begin
  if p_old_pin != (select value from public.app_config where key = 'kitchen_pin') then
    perform pg_sleep(1);
    return false;
  end if;
  update public.app_config set value = p_new_pin where key = 'kitchen_pin';
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_order_secure(...) -> uuid
-- The ONLY way to create an order. Server-authoritative:
--   * table_number is derived from the token, never the client.
--   * Every line is rebuilt from public.menu: base price + modifier option
--     prices matched by groupId/optionId. Client prices/titles are ignored.
--   * Availability is enforced (is_available, unavailable_dates as date[],
--     not_served_windows using the client's LOCAL date/time).
--   * total is computed server-side; there is no p_total parameter.
-- Returns the new order's uuid.
-- ---------------------------------------------------------------------------
create or replace function submit_order_secure(
  p_token text,
  p_customer_name text,
  p_notes text,
  p_items jsonb,
  p_local_date text,
  p_local_time text
) returns uuid language plpgsql security definer as $$
declare
  v_table text;
  v_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_total numeric := 0;

  v_item jsonb;
  v_menu public.menu%rowtype;
  v_qty integer;
  v_unit numeric;
  v_mods jsonb;

  v_mod jsonb;
  v_gid text;
  v_oid text;
  v_opt_price numeric;
  v_opt_label text;
  v_opt_label_ar text;
  v_grp_label text;
  v_grp_label_ar text;

  v_served jsonb;
  v_now_min integer;
  v_from_min integer;
  v_to_min integer;
begin
  -- Resolve the token to a table number. Fails fast on unknown tokens; the
  -- UUID space is unguessable so scanning is not feasible.
  select table_number into v_table from public.table_tokens where token = p_token;
  if v_table is null then
    raise exception 'Invalid table token';
  end if;

  -- Basic payload validation.
  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'Customer name required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Empty order';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Maximum 50 items per order';
  end if;

  -- Rebuild each line from the authoritative menu row.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'Quantity must be 1-99';
    end if;

    select * into v_menu from public.menu where id = v_item->>'itemId';
    if v_menu.id is null then
      raise exception 'Item not found: %', v_item->>'itemId';
    end if;

    -- Availability enforcement.
    if v_menu.is_available = false then
      raise exception 'Item unavailable: %', v_menu.title_en;
    end if;
    if p_local_date is not null
       and v_menu.unavailable_dates is not null
       and (p_local_date)::date = any(v_menu.unavailable_dates) then
      raise exception 'Item not served on this date: %', v_menu.title_en;
    end if;
    if p_local_time is not null and v_menu.not_served_windows is not null then
      v_now_min := (split_part(p_local_time, ':', 1))::int * 60
                 + (split_part(p_local_time, ':', 2))::int;
      for v_served in select value from jsonb_array_elements(v_menu.not_served_windows) loop
        v_from_min := (split_part(v_served->>'from', ':', 1))::int * 60
                    + (split_part(v_served->>'from', ':', 2))::int;
        v_to_min := (split_part(v_served->>'to', ':', 1))::int * 60
                  + (split_part(v_served->>'to', ':', 2))::int;
        if (v_from_min <= v_to_min and v_now_min >= v_from_min and v_now_min < v_to_min)
           or (v_from_min > v_to_min and (v_now_min >= v_from_min or v_now_min < v_to_min)) then
          raise exception 'Item not served now: %', v_menu.title_en;
        end if;
      end loop;
    end if;

    -- Recalculate price: base price + modifier option prices from the menu row.
    v_unit := v_menu.price;
    v_mods := '[]'::jsonb;
    for v_mod in select value from jsonb_array_elements(coalesce(v_item->'modifiers', '[]'::jsonb)) loop
      v_gid := v_mod->>'groupId';
      v_oid := v_mod->>'optionId';
      v_opt_price := null;
      v_opt_label := null;
      v_opt_label_ar := null;
      v_grp_label := null;
      v_grp_label_ar := null;
      select coalesce((o.value->>'price')::numeric, 0),
             o.value->'label'->>'en',
             o.value->'label'->>'ar',
             g.value->'label'->>'en',
             g.value->'label'->>'ar'
      into v_opt_price, v_opt_label, v_opt_label_ar, v_grp_label, v_grp_label_ar
      from jsonb_array_elements(v_menu.modifiers) g
      cross join jsonb_array_elements(g.value->'options') o
      where g.value->>'id' = v_gid and o.value->>'id' = v_oid;
      if v_opt_label is null then
        raise exception 'Invalid modifier for item: %', v_menu.title_en;
      end if;
      v_unit := v_unit + v_opt_price;
      v_mods := v_mods || jsonb_build_object(
        'groupId', v_gid,
        'optionId', v_oid,
        'group', v_grp_label,
        'group_ar', v_grp_label_ar,
        'option', v_opt_label,
        'option_ar', v_opt_label_ar,
        'price', v_opt_price
      );
    end loop;

    v_total := v_total + v_unit * v_qty;
    v_items := v_items || jsonb_build_object(
      'itemId', v_menu.id,
      'title', v_menu.title_en,
      'title_ar', v_menu.title_ar,
      'quantity', v_qty,
      'unitPrice', v_unit,
      'modifiers', v_mods
    );
  end loop;

  -- Insert; table_number always comes from the token, never the client.
  insert into public.orders (
    table_number, customer_name, notes, payment_method, items, total, paid
  ) values (
    v_table, btrim(p_customer_name), coalesce(p_notes, ''), 'waiter', v_items, v_total, false
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- insert_menu_item_secure(...) — kitchen creates a menu item.
-- ---------------------------------------------------------------------------
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
  if p_pin != (select value from public.app_config where key = 'kitchen_pin') then
    raise exception 'Invalid PIN';
  end if;

  if exists (select 1 from public.menu where id = p_id) then
    raise exception 'An item with this id already exists';
  end if;

  insert into public.menu (
    id, category, title_en, title_ar, description_en, description_ar,
    price, image, not_served_windows, is_available, modifiers
  ) values (
    p_id, p_category, p_title_en, p_title_ar, p_description_en, p_description_ar,
    p_price, p_image, p_not_served_windows, p_is_available, p_modifiers
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- update_menu_item_secure(...) — kitchen edits a menu item.
-- ---------------------------------------------------------------------------
create or replace function update_menu_item_secure(
  p_pin text,
  p_id text,
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
  if p_pin != (select value from public.app_config where key = 'kitchen_pin') then
    raise exception 'Invalid PIN';
  end if;

  update public.menu set
    title_en = p_title_en,
    title_ar = p_title_ar,
    description_en = p_description_en,
    description_ar = p_description_ar,
    price = p_price,
    image = p_image,
    not_served_windows = p_not_served_windows,
    is_available = p_is_available,
    modifiers = p_modifiers
  where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_menu_item_secure(...) — kitchen removes a menu item.
-- ---------------------------------------------------------------------------
create or replace function delete_menu_item_secure(
  p_pin text,
  p_id text
) returns void language plpgsql security definer as $$
begin
  if p_pin != (select value from public.app_config where key = 'kitchen_pin') then
    raise exception 'Invalid PIN';
  end if;

  delete from public.menu where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- insert_category_secure(...) — kitchen creates a category (appended at end).
-- ---------------------------------------------------------------------------
create or replace function insert_category_secure(
  p_pin text,
  p_id text,
  p_label_en text,
  p_label_ar text
) returns void language plpgsql security definer as $$
declare
  v_sort integer;
begin
  if p_pin != (select value from public.app_config where key = 'kitchen_pin') then
    raise exception 'Invalid PIN';
  end if;

  if exists (select 1 from public.categories where id = p_id) then
    raise exception 'A category with this id already exists';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.categories;

  insert into public.categories (id, label_en, label_ar, sort_order)
  values (p_id, p_label_en, p_label_ar, v_sort);
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_category_secure(...) — kitchen deletes a category and its items.
-- ---------------------------------------------------------------------------
create or replace function delete_category_secure(
  p_pin text,
  p_id text
) returns void language plpgsql security definer as $$
begin
  if p_pin != (select value from public.app_config where key = 'kitchen_pin') then
    raise exception 'Invalid PIN';
  end if;

  delete from public.menu where category = p_id;
  delete from public.categories where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_order_paid_secure(...) — checkout marks a single order as paid.
-- ---------------------------------------------------------------------------
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

-- NOTE: Storage image deletion is NOT done here. Storage tables cannot be
-- deleted directly (the storage extension blocks it with 42501), and pg_net's
-- async HTTP calls proved unreliable on this instance. Instead the client
-- calls the `delete-storage-object` Supabase Edge Function (PIN-gated, uses
-- the server-side service role key). See supabase/functions/.

-- =============================================================================
-- 7. SEED DATA
-- =============================================================================

-- Default kitchen PIN (plain text). Change via the "Change Kitchen Passphrase" UI.
insert into public.app_config (key, value)
values ('kitchen_pin', 'ADMI1N12#$@$@$@$')
on conflict (key) do nothing;

-- service_role_key is NOT stored in app_config (it would be a committed
-- secret). It lives only in the delete-storage-object Edge Function's runtime
-- environment, which Supabase provides automatically.

-- Table QR tokens. These are the same tokens used by table-links.md; adding a
-- table means adding one row here and one link in that file.
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
