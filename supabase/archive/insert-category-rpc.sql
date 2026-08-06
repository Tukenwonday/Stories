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
