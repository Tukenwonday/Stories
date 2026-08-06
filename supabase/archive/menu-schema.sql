-- ===========================================================================
-- Stories Resto Cafe — Core Tables
-- Run this in the Supabase SQL editor once to create the base tables.
-- ===========================================================================

-- Categories
create table if not exists public.categories (
  id text primary key,
  label_en text not null,
  label_ar text not null,
  sort_order integer not null default 0
);

-- Menu items
create table if not exists public.menu (
  id text primary key,
  category text not null references public.categories(id),
  title_en text not null,
  title_ar text not null,
  description_en text not null,
  description_ar text not null,
  price numeric not null,
  image text,
  tag_en text,
  tag_ar text,
  modifiers jsonb not null default '[]'::jsonb,
  not_served_windows jsonb not null default '[]'::jsonb,
  is_available boolean not null default true,
  unavailable_dates text[] not null default '{}'
);

-- Orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  table_number text not null,
  customer_name text not null,
  notes text not null default '',
  payment_method text not null default 'waiter',
  items jsonb not null,
  total numeric not null,
  paid boolean not null default false
);

-- App config (PIN etc.)
create table if not exists public.app_config (
  key text primary key,
  value text not null
);

-- Indexes
create index if not exists idx_menu_category on public.menu(category);
create index if not exists idx_orders_table on public.orders(table_number);
create index if not exists idx_orders_created on public.orders(created_at);

-- Enable RLS
alter table public.categories enable row level security;
alter table public.menu enable row level security;
alter table public.orders enable row level security;
alter table public.app_config enable row level security;

-- Allow public read on categories and menu
drop policy if exists "categories public read" on public.categories;
create policy "categories public read" on public.categories for select using (true);

drop policy if exists "menu public read" on public.menu;
create policy "menu public read" on public.menu for select using (true);

-- Orders are inserted only via the submit_order_secure RPC (see order-rpc.sql).
-- No insert policy here, so direct REST inserts are blocked by RLS.

-- App config: no public access
drop policy if exists "app_config no access" on public.app_config;
create policy "app_config no access" on public.app_config for all using (false);
