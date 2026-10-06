-- Separate demo receipts: no real orders, customer data, charges or stock writes.
begin;
create table if not exists public.demo_orders (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 request_hash text not null, items jsonb not null,
 subtotal numeric(12,2) not null check(subtotal>=0),
 fulfillment text not null check(fulfillment in ('pickup','delivery','shipping')),
 payment_method text not null default 'apple_pay_demo' check(payment_method='apple_pay_demo'),
 status text not null default 'simulated' check(status='simulated'),
 created_at timestamptz not null default now()
);
alter table public.demo_orders enable row level security;
revoke all on public.demo_orders from anon,authenticated;
create or replace function public.create_demo_order(p_request_id uuid,p_items jsonb,p_fulfillment text,p_expected_subtotal numeric)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 fingerprint text; previous public.demo_orders%rowtype; saved public.demo_orders%rowtype;
 entry jsonb; prod public.products%rowtype; var public.product_variants%rowtype;
 product_key uuid; variant_key uuid; qty integer; unit_price numeric; available integer;
 label text; qty_total bigint; subtotal_value numeric:=0; snapshots jsonb:='[]'::jsonb;
begin
 if p_request_id is null or p_fulfillment is null or p_fulfillment not in ('pickup','delivery','shipping') or p_expected_subtotal is null or p_expected_subtotal<0 or p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Invalid demo checkout.'; end if;
 if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then raise exception 'Invalid demo cart size.'; end if;
 fingerprint:=md5(jsonb_build_object('items',p_items,'fulfillment',p_fulfillment,'subtotal',p_expected_subtotal)::text);
 perform pg_advisory_xact_lock(hashtext(p_request_id::text));
 select * into previous from public.demo_orders where request_id=p_request_id;
 if found then
  if previous.request_hash<>fingerprint then raise exception 'This demo request was already used. Start a new checkout.'; end if;
  return jsonb_build_object('id',previous.id,'reference','DEMO-'||upper(left(previous.id::text,8)),'subtotal',previous.subtotal,'fulfillment',previous.fulfillment,'createdAt',previous.created_at,'items',previous.items,'demo',true);
 end if;
 for entry in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(entry)<>'object' or jsonb_typeof(entry->'quantity')<>'number' or (entry->>'quantity')!~'^[1-9][0-9]?$' then raise exception 'Invalid demo quantity.'; end if;
  product_key:=(entry->>'productId')::uuid; variant_key:=nullif(entry->>'variantId','')::uuid; qty:=(entry->>'quantity')::integer;
  select * into prod from public.products where id=product_key and active=true;
  if not found then raise exception 'A product is no longer available.'; end if;
  if variant_key is not null then
   select * into var from public.product_variants where id=variant_key and product_id=product_key and active=true;
   if not found then raise exception 'A product option is no longer available.'; end if;
   unit_price:=round(var.price,2); available:=var.stock;
   label:=concat_ws(' / ',nullif(var.option1_value,'Default Title'),nullif(var.option2_value,'Default Title'),nullif(var.option3_value,'Default Title'));
  else
   if exists(select 1 from public.product_variants where product_id=product_key) then raise exception 'Choose a product option before checking out.'; end if;
   unit_price:=round(prod.price,2); available:=prod.stock; label:=null;
  end if;
  select sum((value->>'quantity')::integer) into qty_total from jsonb_array_elements(p_items) where (value->>'productId')::uuid=product_key and nullif(value->>'variantId','')::uuid is not distinct from variant_key;
  if available is null or available<=0 or qty_total>available then raise exception 'Inventory changed. Review your cart before retrying.'; end if;
  if unit_price is null or unit_price<0 then raise exception 'A product price is unavailable.'; end if;
  subtotal_value:=subtotal_value+unit_price*qty;
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('productId',product_key,'variantId',variant_key,'name',prod.name,'variant',label,'quantity',qty,'price',unit_price));
 end loop;
 if subtotal_value<>round(p_expected_subtotal,2) then raise exception 'Prices changed. Review the updated total before retrying.'; end if;
 insert into public.demo_orders(request_id,request_hash,items,subtotal,fulfillment) values(p_request_id,fingerprint,snapshots,subtotal_value,p_fulfillment) returning * into saved;
 return jsonb_build_object('id',saved.id,'reference','DEMO-'||upper(left(saved.id::text,8)),'subtotal',saved.subtotal,'fulfillment',saved.fulfillment,'createdAt',saved.created_at,'items',saved.items,'demo',true);
end;
$$;
revoke all on function public.create_demo_order(uuid,jsonb,text,numeric) from public;
grant execute on function public.create_demo_order(uuid,jsonb,text,numeric) to anon,authenticated;
commit;
