-- ===========================================================================
-- Stories Resto Cafe — Secure Menu RPC Functions
-- Run this in the Supabase SQL editor to secure your menu editor dashboard.
-- ===========================================================================

-- 1. Create a secure config table to store the kitchen PIN on the database
create table if not exists public.app_config (
  key text primary key,
  value text not null
);

-- Seed the default PIN (you can change '2026' to whatever PIN you want to use)
insert into public.app_config (key, value) 
values ('kitchen_pin', '2026')
on conflict (key) do nothing;

-- Enable Row Level Security on the config table.
-- With no policies created, no anonymous user or client can read or modify it.
alter table public.app_config enable row level security;

-- 2. Revoke anonymous direct modification permissions on the menu table
drop policy if exists "anon can update menu" on public.menu;
drop policy if exists "anon can delete menu" on public.menu;

-- 3. Create a secure RPC function to update a menu item
create or replace function update_menu_item_secure(
  p_pin text,
  p_id text,
  p_title_en text,
  p_title_ar text,
  p_description_en text,
  p_description_ar text,
  p_price numeric,
  p_image text,
  -- Using jsonb for modifiers and time windows
  p_not_served_windows jsonb,
  p_is_available boolean,
  p_modifiers jsonb
) returns void language plpgsql security definer as $$
begin
  -- Validate the PIN
  if p_pin != (select value from public.app_config where key = 'kitchen_pin') then
    raise exception 'Invalid PIN';
  end if;

  -- Perform the update
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

-- 4. Create a secure RPC function to delete a menu item
create or replace function delete_menu_item_secure(
  p_pin text,
  p_id text
) returns void language plpgsql security definer as $$
begin
  -- Validate the PIN
  if p_pin != (select value from public.app_config where key = 'kitchen_pin') then
    raise exception 'Invalid PIN';
  end if;

  -- Perform the deletion
  delete from public.menu where id = p_id;
end;
$$;

-- 5. Create a secure RPC function to verify the kitchen PIN
create or replace function verify_kitchen_pin(
  p_pin text
) returns boolean language plpgsql security definer as $$
begin
  return p_pin = (select value from public.app_config where key = 'kitchen_pin');
end;
$$;
