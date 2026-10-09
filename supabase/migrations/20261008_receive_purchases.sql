begin;

create table if not exists public.purchase_receipts (
  purchase_id uuid primary key,
  version integer not null check (version > 0),
  purchase jsonb not null,
  received_at timestamptz not null default now(),
  received_by uuid not null
);
alter table public.purchase_receipts enable row level security;
revoke all on public.purchase_receipts from public, anon, authenticated;
grant select, insert on public.purchase_receipts to service_role;

create or replace function public.receive_admin_purchase(
  p_purchase_id uuid, p_version integer, p_purchase jsonb, p_actor uuid
) returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_existing public.purchase_receipts%rowtype;
  v_line jsonb;
  v_product uuid;
  v_variant uuid;
  v_units integer;
  v_count integer;
  v_received timestamptz := clock_timestamp();
begin
  if not exists(select 1 from public.admin_users where user_id = p_actor) then
    raise exception 'Admin access required.';
  end if;
  if p_purchase_id is null or p_version is null or p_version < 1
    or p_purchase->>'id' is distinct from p_purchase_id::text
    or (p_purchase->>'version')::integer is distinct from p_version
    or jsonb_typeof(p_purchase->'lines') is distinct from 'array'
    or jsonb_array_length(p_purchase->'lines') not between 1 and 100 then
    raise exception 'Invalid purchase.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_purchase_id::text, 10));
  select * into v_existing from public.purchase_receipts where purchase_id = p_purchase_id;
  if found then
    return jsonb_build_object('purchase', v_existing.purchase, 'receivedAt', v_existing.received_at, 'alreadyReceived', true);
  end if;

  -- Lock product rows in a stable order for the entire multi-item receipt.
  perform p.id from public.products p
  where p.id in (select (line->>'productId')::uuid from jsonb_array_elements(p_purchase->'lines') line)
  order by p.id for update;

  for v_line in select value from jsonb_array_elements(p_purchase->'lines') loop
    v_product := (v_line->>'productId')::uuid;
    v_variant := nullif(v_line->>'variantId', '')::uuid;
    if (v_line->>'packs')::numeric <> trunc((v_line->>'packs')::numeric)
      or (v_line->>'unitsPerPack')::numeric <> trunc((v_line->>'unitsPerPack')::numeric)
      or (v_line->>'packs')::numeric not between 1 and 100000
      or (v_line->>'unitsPerPack')::numeric not between 1 and 100000 then
      raise exception 'Invalid purchase quantity.';
    end if;
    v_units := (v_line->>'packs')::integer * (v_line->>'unitsPerPack')::integer;
    if v_units is null or v_units not between 1 and 1000000 then raise exception 'Invalid units.'; end if;
    if v_variant is not null then
      update public.product_variants set stock = stock + v_units
      where id = v_variant and product_id = v_product and stock is not null;
      get diagnostics v_count = row_count;
      if v_count <> 1 then raise exception 'Product variant no longer exists.'; end if;
      update public.products set stock = (select sum(stock) from public.product_variants where product_id = v_product)
      where id = v_product;
    else
      update public.products set stock = stock + v_units
      where id = v_product and stock is not null and not exists (
        select 1 from public.product_variants where product_id = v_product
      );
      get diagnostics v_count = row_count;
      if v_count <> 1 then raise exception 'Select a valid product variant.'; end if;
    end if;
  end loop;

  insert into public.purchase_receipts(purchase_id, version, purchase, received_at, received_by)
    values(p_purchase_id, p_version, p_purchase, v_received, p_actor);
  return jsonb_build_object('purchase', p_purchase, 'receivedAt', v_received, 'alreadyReceived', false);
end;
$function$;
revoke all on function public.receive_admin_purchase(uuid,integer,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.receive_admin_purchase(uuid,integer,jsonb,uuid) to service_role;
commit;
