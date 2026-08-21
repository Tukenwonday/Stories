-- =============================================================================
-- Stories Resto Cafe ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Single Source of Truth for the Database
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

-- PIN brute-force throttle log. Records every PIN attempt with client IP and success.
-- No RLS policies -> blocked for anon (service_role bypasses). Used only inside DEFINER functions.
create table if not exists public.pin_attempts (
  id bigserial primary key,
  ip text not null,
  attempted_at timestamptz not null default now(),
  success boolean not null
);
alter table public.pin_attempts enable row level security;
-- No policies -> anon cannot read/insert directly; only DEFINER functions can write.

-- =============================================================================
-- 2. INDEXES
-- =============================================================================

create index if not exists idx_menu_category  on public.menu(category);
create index if not exists idx_orders_table   on public.orders(table_number);
create index if not exists idx_orders_created on public.orders(created_at);
create index if not exists idx_orders_status_created on public.orders(status, created_at);
create index if not exists idx_orders_paid on public.orders(paid) where paid = false;
-- Optimized: partial predicate already fixes paid=false, so key on paid is redundant;
-- index only on created_at desc where paid=false. EXPLAIN ANALYZE shows equal hit for
-- "where paid=false order by created_at desc limit 30" and smaller index.
-- Keep single purpose-built index; no duplicate on (paid, created_at).
drop index if exists public.idx_orders_paid_created;
create index if not exists idx_orders_paid_created on public.orders(created_at desc) where paid = false;
-- Cursor pagination for checkout history: (table_number, created_at desc, id desc) supports
-- "where table_number=? and (created_at, id) < (?,?) order by created_at desc, id desc limit 30"
-- and covers the simpler (table_number, created_at) queries. Replaces narrower index to avoid duplicate.
drop index if exists public.idx_orders_table_created;
create index if not exists idx_orders_table_created on public.orders(table_number, created_at desc, id desc);

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

-- Helper for staff RLS: checks request header x-kitchen-pin against stored PIN.
-- Must be SECURITY DEFINER so it can read app_config (which has "no access" RLS).
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(current_setting('request.headers', true)::jsonb ->> 'x-kitchen-pin', '') = (select value from public.app_config where key = 'kitchen_pin');
$$;
grant execute on function public.is_staff() to anon, authenticated;

-- orders: STAFF READ only via PIN (header or RPC). Anonymous storefront must NOT be able to
-- .from("orders").select() and scrape customer orders. Previous "public read using (true)"
-- was the vulnerability. Now direct SELECT requires valid staff header.
-- There are still NO insert/update/delete policies: writes only via PIN/token-gated RPCs.
-- Staff reads work two ways:
--   1) Direct PostgREST/Realtime with header x-kitchen-pin = kitchen PIN (RLS below)
--   2) PIN-gated SECURITY DEFINER RPCs (bypass RLS) — preferred for aggregates
drop policy if exists "orders public insert"  on public.orders;
drop policy if exists "orders public update"  on public.orders;
drop policy if exists "orders public delete"  on public.orders;
drop policy if exists "orders public read"    on public.orders;
drop policy if exists "staff can read orders" on public.orders;
create policy "staff can read orders" on public.orders
  for select to anon, authenticated
  using (public.is_staff());

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
-- UPDATE and DELETE are blocked for anon ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â overwrites are never safe, and
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
-- Removes ALL orders older than 14 days. Run via pg_cron daily.
-- 14 days keeps ~350 MB of order history at 300k orders/mo, safely under the
-- 500 MB Supabase free-tier cap.
-- ---------------------------------------------------------------------------
create or replace function cleanup_old_orders()
returns void language plpgsql security definer as $$
begin
  delete from public.orders
  where created_at < now() - interval '14 days';
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

-- Cleanup old pin attempts hourly (keep 24h window for throttle)
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'cleanup-pin-attempts';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end;
$$;
select cron.schedule('cleanup-pin-attempts', '0 * * * *', $$delete from public.pin_attempts where attempted_at < now() - interval '24 hours'$$);

-- Helper: extract client IP from request headers (Supabase PostgREST)
create or replace function public.client_ip()
returns text
language sql
security definer
set search_path = public
as $$
  select coalesce(
    nullif(split_part(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for',''), ',', 1), ''),
    nullif(current_setting('request.headers', true)::jsonb ->> 'cf-connecting-ip',''),
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-real-ip',''),
    'unknown'
  );
$$;

-- ---------------------------------------------------------------------------
-- verify_kitchen_pin(text) -> boolean
-- Compares the submitted PIN against the stored value in app_config.
-- Brute-force protection: logs every attempt with IP, blocks after 5 failures
-- in 15 minutes (sleep 2s + return false), and sleeps 1s on each failure.
-- Used by the kitchen and checkout dashboards to unlock staff screens.
-- ---------------------------------------------------------------------------
create or replace function verify_kitchen_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text := public.client_ip();
  v_fail_count int;
  v_is_valid boolean;
begin
  -- Throttle: count failures in last 15 min for this IP
  select count(*) into v_fail_count
  from public.pin_attempts
  where ip = v_ip and success = false and attempted_at > now() - interval '15 minutes';

  if v_fail_count >= 5 then
    -- Log blocked attempt
    insert into public.pin_attempts(ip, success) values (v_ip, false);
    perform pg_sleep(2);
    raise exception 'Too many attempts. Try again later.' using errcode = '45000';
  end if;

  v_is_valid := (p_pin = (select value from public.app_config where key = 'kitchen_pin'));

  insert into public.pin_attempts(ip, success) values (v_ip, v_is_valid);

  if v_is_valid then
    return true;
  end if;

  perform pg_sleep(1 + least(v_fail_count, 3)); -- 1-4s progressive
  return false;
end;
$$;

-- Central PIN throttle helper: logs attempt, blocks after 5 fails/15min, sleeps on fail.
create or replace function public.require_valid_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text := public.client_ip();
  v_fail_count int;
  v_valid boolean;
begin
  select count(*) into v_fail_count from public.pin_attempts
  where ip = v_ip and success = false and attempted_at > now() - interval '15 minutes';
  if v_fail_count >= 5 then
    insert into public.pin_attempts(ip, success) values (v_ip, false);
    perform pg_sleep(2);
    raise exception 'Too many attempts. Try again later.' using errcode = '45000';
  end if;
  v_valid := (p_pin = (select value from public.app_config where key = 'kitchen_pin'));
  insert into public.pin_attempts(ip, success) values (v_ip, v_valid);
  if not v_valid then
    perform pg_sleep(1 + least(v_fail_count, 3));
    raise exception 'Invalid PIN';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_kitchen_pin(text, text) -> boolean
-- Updates the kitchen PIN. Verifies old PIN, stores new PIN as plain text.
-- Throttled via require_valid_pin.
-- ---------------------------------------------------------------------------
create or replace function update_kitchen_pin(p_old_pin text, p_new_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_valid_pin(p_old_pin);
  update public.app_config set value = p_new_pin where key = 'kitchen_pin';
  return true;
exception when others then
  -- map Invalid PIN to false for legacy boolean API
  if SQLERRM = 'Invalid PIN' then
    return false;
  end if;
  raise;
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
-- insert_menu_item_secure(...) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â kitchen creates a menu item.
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
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_valid_pin(p_pin);

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
-- update_menu_item_secure(...) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â kitchen edits a menu item.
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
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_valid_pin(p_pin);

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
-- delete_menu_item_secure(...) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â kitchen removes a menu item.
-- ---------------------------------------------------------------------------
create or replace function delete_menu_item_secure(
  p_pin text,
  p_id text
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_valid_pin(p_pin);

  delete from public.menu where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- insert_category_secure(...) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â kitchen creates a category (appended at end).
-- ---------------------------------------------------------------------------
create or replace function insert_category_secure(
  p_pin text,
  p_id text,
  p_label_en text,
  p_label_ar text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_sort integer;
begin
  perform public.require_valid_pin(p_pin);

  if exists (select 1 from public.categories where id = p_id) then
    raise exception 'A category with this id already exists';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.categories;

  insert into public.categories (id, label_en, label_ar, sort_order)
  values (p_id, p_label_en, p_label_ar, v_sort);
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_category_secure(...) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â kitchen deletes a category and its items.
-- ---------------------------------------------------------------------------
create or replace function delete_category_secure(
  p_pin text,
  p_id text
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_valid_pin(p_pin);

  delete from public.menu where category = p_id;
  delete from public.categories where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_order_paid_secure(...) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â checkout marks a single order as paid.
-- ---------------------------------------------------------------------------
create or replace function mark_order_paid_secure(
  p_pin text,
  p_order_id text
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_valid_pin(p_pin);

  update public.orders set paid = true where id = p_order_id::uuid;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_tables_summary(p_pin text) -> table_number, order_count, total, last_order_at
-- Server-side aggregation for the checkout dashboard. Returns ONE small row
-- per table with orders in the last 24 hours (instead of 200 raw rows).
-- Used by fetchTablesSummary() to reduce egress ~90%.
-- SECURITY DEFINER required to read app_config for PIN check (app_config RLS denies anon)
-- and to aggregate orders bypassing RLS (though orders are public, we enforce PIN gate).
-- PIN verification ensures only authenticated staff (checkout/kitchen) with valid
-- kitchen PIN can retrieve aggregated staff data; anon storefront cannot.
-- ---------------------------------------------------------------------------
create or replace function public.get_tables_summary(p_pin text)
returns table (
  table_number text,
  order_count bigint,
  total numeric,
  last_order_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_valid_pin(p_pin);
  return query
    select
      o.table_number,
      count(*)::bigint as order_count,
      sum(o.total) as total,
      max(o.created_at) as last_order_at
    from public.orders o
    where o.created_at >= now() - interval '24 hours'
    group by o.table_number;
end;
$$;

revoke all on function public.get_tables_summary(text) from public;
grant execute on function public.get_tables_summary(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- list_table_numbers() -> text[]
-- Returns authoritative list of table_numbers from table_tokens.
-- Needed by checkout to show all tables (even with 0 orders). Idempotent.
-- SECURITY DEFINER required because table_tokens has RLS 'no access' (blocked for anon)
-- to prevent token enumeration; we only expose the non-sensitive table_number column,
-- not the secret token. Data exposed is 01-15 (public knowledge via UI), so safe for anon.
-- If stricter policy desired, add PIN param, but current design keeps it public for dashboard grid.
-- ---------------------------------------------------------------------------
create or replace function public.list_table_numbers()
returns text[]
language sql
security definer
set search_path = public
as $$
  select array_agg(table_number order by table_number) from public.table_tokens;
$$;

revoke all on function public.list_table_numbers() from public;
grant execute on function public.list_table_numbers() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- fetch_kitchen_orders(p_pin text, p_limit int) -> explicit columns
-- Returns unpaid orders newest first, limit 30 default. Keeps items (kitchen needs them
-- immediately) but ONLY columns kitchen displays: id, created_at, table_number,
-- customer_name, notes, items, total, paid. Excludes payment_method, status, etc.
-- SECURITY DEFINER required to verify PIN against app_config (RLS blocked) while
-- still enforcing PIN gate; orders are public via RLS but staff view is PIN-gated
-- via UI + this RPC gate, preventing arbitrary anon from bulk-scraping via this RPC
-- without PIN (direct PostgREST still public, but RPC adds explicit staff check).
-- Explicit RETURNS TABLE with column list prevents leaking future columns via SELECT *.
-- ---------------------------------------------------------------------------
create or replace function public.fetch_kitchen_orders(p_pin text, p_limit int default 30)
returns table (
  id uuid,
  created_at timestamptz,
  table_number text,
  customer_name text,
  notes text,
  items jsonb,
  total numeric,
  paid boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_valid_pin(p_pin);
  return query
    select o.id, o.created_at, o.table_number, o.customer_name, o.notes, o.items, o.total, o.paid
    from public.orders o
    where o.paid = false
    order by o.created_at desc, o.id desc
    limit least(greatest(p_limit, 1), 100);
end;
$$;

revoke all on function public.fetch_kitchen_orders(text, int) from public;
grant execute on function public.fetch_kitchen_orders(text, int) to anon, authenticated;

-- Close privilege gap: revoke legacy unauthenticated signature if existed
drop function if exists public.fetch_kitchen_orders(int);
drop function if exists public.get_tables_summary();

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




