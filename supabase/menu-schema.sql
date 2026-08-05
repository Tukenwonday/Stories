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
  not_served_windows jsonb not null default '[]'::jsonb,
  is_available   boolean not null default true,
  unavailable_dates date[] not null default '{}'::date[],
  created_at     timestamptz not null default now()
);

-- Availability controls
--   not_served_windows: array of daily windows the item is NOT served, e.g.
--     [{"from":"14:00","to":"18:00"},{"from":"22:00","to":"06:00"}]
--   Times use the customer's device local time. An empty array = always
--   available. A window where "to" is earlier than "from" crosses midnight.
--   is_available: manual on/off switch (e.g. out of stock / taken off menu).
--   unavailable_dates: specific dates (YYYY-MM-DD) the item is not served.
comment on column public.menu.not_served_windows is
  'Daily NOT-served windows as JSON array of {from,to} times (local time). Empty = always available.';
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

create policy "anon can delete menu" on public.menu
  for delete to anon using (true);

-- ---------------------------------------------------------------------------
-- Upgrade a menu table created with the older not_served_from/not_served_to
-- columns: moves any existing window into not_served_windows, then drops the
-- old columns. Safe to re-run.
-- ---------------------------------------------------------------------------
alter table public.menu add column if not exists not_served_windows jsonb not null default '[]'::jsonb;

update public.menu
  set not_served_windows = jsonb_build_array(
        jsonb_build_object('from', not_served_from, 'to', not_served_to)
      )
  where not_served_from is not null
    and not_served_to is not null
    and not_served_windows = '[]'::jsonb;

alter table public.menu drop column if exists not_served_from;
alter table public.menu drop column if exists not_served_to;
alter table public.menu add column if not exists is_available boolean not null default true;
alter table public.menu add column if not exists unavailable_dates date[] not null default '{}'::date[];
