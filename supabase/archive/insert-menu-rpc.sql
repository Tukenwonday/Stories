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
