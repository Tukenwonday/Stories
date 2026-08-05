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
