begin;
alter table public.orders add column delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0);
alter table public.orders add column total numeric(12,2) generated always as (subtotal + delivery_fee) stored;
create function public.enforce_delivery_fee() returns trigger language plpgsql set search_path = public as $$
begin
  new.delivery_fee := case when new.fulfillment = 'delivery' then 4.99 else 0 end;
  return new;
end;
$$;
create trigger enforce_delivery_fee before insert or update of fulfillment, delivery_fee on public.orders
for each row execute function public.enforce_delivery_fee();
commit;
