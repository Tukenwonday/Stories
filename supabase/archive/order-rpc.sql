-- ===========================================================================
-- Stories Resto Cafe — Secure Order Submission RPC (v2)
-- Run this in the Supabase SQL editor so orders can only be placed with a
-- valid table token (from a table QR code), not with the public anon key.
--
-- v2 changes:
--   * p_total removed. The server now IGNORES any client-supplied prices and
--     rebuilds every line from public.menu (base price + modifier option
--     prices), so a tampered client cannot order at $0 or changed prices.
--   * Availability is enforced server-side: is_available = false, items on
--     unavailable_dates, and items inside a not_served_windows are rejected.
--     The client passes its LOCAL date/time (the DB stores timestamps in UTC)
--     so windows are evaluated in cafe-local time.
--   * Titles and modifier labels are read from the DB, never from the client.
-- ===========================================================================

-- Block direct anonymous inserts into orders.
drop policy if exists "orders public insert" on public.orders;

-- Security definer: runs as the table owner (bypasses RLS) so it can read
-- table_tokens and insert an order for the resolved table. Callable by the
-- anon key, but only accepts a token that already exists in table_tokens.
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
  v_grp_label text;

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

  -- Rebuild each line from the authoritative menu row.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::int;
    if v_qty is null or v_qty < 1 then
      raise exception 'Invalid quantity';
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
      v_grp_label := null;
      select coalesce((o.value->>'price')::numeric, 0),
             o.value->'label'->>'en',
             g.value->'label'->>'en'
      into v_opt_price, v_opt_label, v_grp_label
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
        'option', v_opt_label,
        'price', v_opt_price
      );
    end loop;

    v_total := v_total + v_unit * v_qty;
    v_items := v_items || jsonb_build_object(
      'itemId', v_menu.id,
      'title', v_menu.title_en,
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
