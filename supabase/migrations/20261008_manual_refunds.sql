alter table public.orders
  add column if not exists refund_status text
    not null
    default 'none'
    check (refund_status in ('none','required','refunded')),
  add column if not exists refund_amount numeric(12,2)
    check (refund_amount >= 0),
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_by uuid;

create or replace function public.cancel_customer_order(
  p_order_id uuid,
  p_expected_status text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_rows integer;
  v_now timestamptz := now();
begin
  if p_order_id is null
     or length(trim(coalesce(p_expected_status, ''))) = 0
  then
    raise exception 'Invalid cancellation request.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status is distinct from p_expected_status then
    raise exception 'Order changed before cancellation.';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Order already cancelled.';
  end if;

  if v_order.status = 'completed' then
    raise exception 'Completed orders cannot be cancelled.';
  end if;

  for v_item in
    select *
    from public.order_items
    where order_id = p_order_id
    order by id
  loop
    if v_item.quantity is null
       or v_item.quantity <= 0
    then
      raise exception 'Invalid order item quantity.';
    end if;

    if v_item.variant_id is not null then
      update public.product_variants
      set stock = coalesce(stock, 0) + v_item.quantity
      where id = v_item.variant_id
        and product_id = v_item.product_id;

      get diagnostics v_rows = row_count;

      if v_rows <> 1 then
        raise exception
          'Could not restore variant inventory.';
      end if;
    else
      update public.products
      set stock = coalesce(stock, 0) + v_item.quantity
      where id = v_item.product_id;

      get diagnostics v_rows = row_count;

      if v_rows <> 1 then
        raise exception
          'Could not restore product inventory.';
      end if;
    end if;
  end loop;

  update public.orders
  set
    status = 'cancelled',
    refund_status = case
      when payment_status = 'paid'
      then 'required'
      else 'none'
    end,
    refund_amount = null,
    refunded_at = null,
    refunded_by = null,
    updated_at = v_now
  where id = p_order_id
    and status = p_expected_status
  returning *
  into v_order;

  if not found then
    raise exception
      'Order changed before cancellation.';
  end if;

  return jsonb_build_object(
    'id', v_order.id,
    'status', v_order.status,
    'fulfillment', v_order.fulfillment,
    'payment_status', v_order.payment_status,
    'refund_status', v_order.refund_status,
    'id_review_status', v_order.id_review_status,
    'updated_at', v_order.updated_at
  );
end;
$function$;

revoke all
on function public.cancel_customer_order(uuid, text)
from public, anon, authenticated;

grant execute
on function public.cancel_customer_order(uuid, text)
to service_role;