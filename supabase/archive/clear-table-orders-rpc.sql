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
