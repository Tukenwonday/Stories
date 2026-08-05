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
