-- ===========================================================================
-- Stories Resto Cafe — Secure Order Submission RPC
-- Run this in the Supabase SQL editor so orders can only be placed with a
-- valid table token (from a table QR code), not with the public anon key.
--
-- This replaces the open "orders public insert" RLS policy. Direct inserts
-- via the REST API are denied; the only insert path is this RPC, which
-- derives the table_number from the token server-side.
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
  p_total numeric
) returns uuid language plpgsql security definer as $$
declare
  v_table text;
  v_id uuid;
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
  if p_total is null or p_total < 0 then
    raise exception 'Invalid total';
  end if;

  -- Insert; table_number always comes from the token, never the client.
  insert into public.orders (
    table_number, customer_name, notes, payment_method, items, total, paid
  ) values (
    v_table, btrim(p_customer_name), coalesce(p_notes, ''), 'waiter', p_items, p_total, false
  )
  returning id into v_id;
  return v_id;
end;
$$;
