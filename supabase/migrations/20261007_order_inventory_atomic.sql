-- Make real order creation concurrency-safe and atomically decrement inventory.
-- Production order requests remain disabled by environment configuration.

create or replace function public.create_customer_order(
  p_request_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_fulfillment text,
  p_delivery_address text,
  p_items jsonb,
  p_expected_subtotal numeric
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_quantity integer;
  v_name text;
  v_variant_name text;
  v_price numeric(10,2);
  v_stock integer;
  v_total numeric(10,2) := 0;
  v_order public.orders%rowtype;
  v_existing public.orders%rowtype;
  v_rows integer;
begin
  if p_request_id is null
     or length(trim(coalesce(p_customer_name, ''))) < 2
     or length(p_customer_name) > 120
     or length(trim(coalesce(p_customer_email, ''))) < 5
     or length(p_customer_email) > 254
     or length(coalesce(p_customer_phone, '')) > 30
     or p_fulfillment not in ('pickup', 'delivery', 'shipping')
     or p_expected_subtotal is null
     or p_expected_subtotal < 0
  then
    raise exception 'Invalid order information';
  end if;

  if p_fulfillment <> 'pickup'
     and length(trim(coalesce(p_delivery_address, ''))) < 10
  then
    raise exception 'A delivery or shipping address is required';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 100
  then
    raise exception 'Invalid order items';
  end if;

  select * into v_existing
  from public.orders
  where request_id = p_request_id;

  if found then
    raise exception 'This request has already been submitted';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_variant_id := nullif(v_item->>'variantId', '')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    if v_product_id is null
       or v_quantity is null
       or v_quantity not between 1 and 99
    then
      raise exception 'Invalid product or quantity';
    end if;

    if v_variant_id is not null then
      select
        p.name,
        concat_ws(
          ' / ',
          nullif(v.option1_value, ''),
          nullif(v.option2_value, ''),
          nullif(v.option3_value, '')
        ),
        v.price,
        v.stock
      into
        v_name,
        v_variant_name,
        v_price,
        v_stock
      from public.products p
      join public.product_variants v
        on v.product_id = p.id
      where p.id = v_product_id
        and v.id = v_variant_id
        and p.active = true
        and v.active = true;
    else
      select
        p.name,
        null::text,
        p.price,
        p.stock
      into
        v_name,
        v_variant_name,
        v_price,
        v_stock
      from public.products p
      where p.id = v_product_id
        and p.active = true
        and not exists (
          select 1
          from public.product_variants v
          where v.product_id = p.id
        );
    end if;

    if v_name is null
       or v_price is null
       or v_stock is null
       or v_stock < v_quantity
    then
      raise exception 'Product unavailable or insufficient stock';
    end if;

    v_total := v_total + (v_price * v_quantity);
  end loop;

  if v_total <> p_expected_subtotal then
    raise exception 'Order subtotal changed';
  end if;

  insert into public.orders (
    request_id,
    customer_name,
    customer_email,
    customer_phone,
    fulfillment,
    delivery_address,
    subtotal,
    status,
    payment_status
  )
  values (
    p_request_id,
    trim(p_customer_name),
    lower(trim(p_customer_email)),
    nullif(trim(p_customer_phone), ''),
    p_fulfillment,
    case
      when p_fulfillment = 'pickup'
      then null
      else trim(p_delivery_address)
    end,
    v_total,
    'pending',
    'unpaid'
  )
  returning * into v_order;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_variant_id := nullif(v_item->>'variantId', '')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    if v_variant_id is not null then
      select
        p.name,
        concat_ws(
          ' / ',
          nullif(v.option1_value, ''),
          nullif(v.option2_value, ''),
          nullif(v.option3_value, '')
        ),
        v.price
      into
        v_name,
        v_variant_name,
        v_price
      from public.products p
      join public.product_variants v
        on v.product_id = p.id
      where p.id = v_product_id
        and v.id = v_variant_id;

      update public.product_variants
      set stock = stock - v_quantity
      where id = v_variant_id
        and product_id = v_product_id
        and active = true
        and stock is not null
        and stock >= v_quantity;

      get diagnostics v_rows = row_count;

      if v_rows <> 1 then
        raise exception
          'Inventory changed. Review your cart before retrying.';
      end if;
    else
      select
        name,
        null::text,
        price
      into
        v_name,
        v_variant_name,
        v_price
      from public.products
      where id = v_product_id;

      update public.products p
      set stock = p.stock - v_quantity
      where p.id = v_product_id
        and p.active = true
        and p.stock is not null
        and p.stock >= v_quantity
        and not exists (
          select 1
          from public.product_variants v
          where v.product_id = p.id
        );

      get diagnostics v_rows = row_count;

      if v_rows <> 1 then
        raise exception
          'Inventory changed. Review your cart before retrying.';
      end if;
    end if;

    insert into public.order_items (
      order_id,
      product_id,
      variant_id,
      product_name,
      variant_name,
      quantity,
      unit_price
    )
    values (
      v_order.id,
      v_product_id,
      v_variant_id,
      v_name,
      v_variant_name,
      v_quantity,
      v_price
    );
  end loop;

  return jsonb_build_object(
    'orderNumber', v_order.order_number,
    'trackingToken', v_order.tracking_token,
    'status', v_order.status,
    'subtotal', v_order.subtotal,
    'paymentCollected', false
  );
end;
$function$;
