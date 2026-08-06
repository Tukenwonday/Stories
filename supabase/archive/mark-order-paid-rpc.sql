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
