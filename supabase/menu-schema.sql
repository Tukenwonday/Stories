-- ===========================================================================
-- Stories Resto Cafe — menu schema
-- Run this file first (in the Supabase SQL editor), then run menu-seed.sql
-- to populate the tables from public/menu.json.
-- ===========================================================================

create table if not exists public.categories (
  id         text primary key,
  label_en   text not null,
  label_ar   text not null,
  sort_order int  not null default 0
);

create table if not exists public.menu (
  id             text primary key,
  category       text   not null references public.categories (id),
  title_en       text   not null,
  title_ar       text   not null,
  description_en text   not null default '',
  description_ar text   not null default '',
  price          numeric not null check (price >= 0),
  image          text,
  tag_en         text,
  tag_ar         text,
  modifiers      jsonb  not null default '[]'::jsonb,
  not_served_from time,
  not_served_to   time,
  is_available   boolean not null default true,
  unavailable_dates date[] not null default '{}'::date[],
  created_at     timestamptz not null default now()
);

-- Availability controls
--   not_served_from / not_served_to use the customer's device local time
--   (format HH:MM:SS). Leave both NULL to make the item always available.
--   When set, the item is NOT served inside that daily window and available
--   outside it. If not_served_to is earlier than not_served_from the window
--   crosses midnight, e.g. from '22:00:00' to '06:00:00' = not served from
--   10 PM to 6 AM.
--   is_available: manual on/off switch (e.g. out of stock / taken off menu).
--   unavailable_dates: specific dates (YYYY-MM-DD) the item is not served.
comment on column public.menu.not_served_from is
  'Start of the daily NOT-served window (HH:MM:SS, local time). NULL = always available.';
comment on column public.menu.not_served_to is
  'End of the daily NOT-served window (HH:MM:SS, local time). If before not_served_from, the window crosses midnight.';
comment on column public.menu.is_available is
  'Manual availability switch; false hides the item from ordering.';
comment on column public.menu.unavailable_dates is
  'Dates (YYYY-MM-DD) the item is not served on.';

create index if not exists menu_category_idx on public.menu (category);

-- ---------------------------------------------------------------------------
-- Row Level Security: the storefront reads the menu with the anon key.
-- The menu editor (kitchen dashboard) updates rows with the same key — in
-- this v0 it is protected only by the kitchen PIN, not by Supabase auth.
-- ---------------------------------------------------------------------------
alter table public.menu enable row level security;
alter table public.categories enable row level security;

create policy "anon can read menu" on public.menu
  for select to anon using (true);

create policy "anon can read categories" on public.categories
  for select to anon using (true);

create policy "anon can update menu" on public.menu
  for update to anon using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Upgrade a menu table created with the older "available_from/available_to"
-- columns: adds the new columns. If you had set available windows on any
-- item, re-enter them as NOT-served windows (the meaning is inverted).
-- ---------------------------------------------------------------------------
alter table public.menu add column if not exists not_served_from time;
alter table public.menu add column if not exists not_served_to time;
alter table public.menu add column if not exists is_available boolean not null default true;
alter table public.menu add column if not exists unavailable_dates date[] not null default '{}'::date[];
