-- Record manual refunds atomically and enforce refund invariants at the table.

create or replace function public.enforce_order_refund_integrity()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE'
     and old.refund_status = 'refunded'
     and (
       new.status is distinct from old.status
       or new.payment_status is distinct from old.payment_status
       or new.payment_method is distinct from old.payment_method
       or new.payment_received_amount is distinct from old.payment_received_amount
       or new.refund_status is distinct from old.refund_status
       or new.refund_amount is distinct from old.refund_amount
       or new.refunded_at is distinct from old.refunded_at
       or new.refunded_by is distinct from old.refunded_by
     )
  then
    raise exception 'Recorded refunds are immutable.';
  end if;

  if new.refund_status = 'none' then
    if new.refund_amount is not null
       or new.refunded_at is not null
       or new.refunded_by is not null
    then
      raise exception 'Orders without refunds cannot have refund metadata.';
    end if;
  elsif new.refund_status = 'required' then
    if new.status <> 'cancelled'
       or new.payment_status <> 'paid'
    then
      raise exception 'Only cancelled paid orders can require refunds.';
    end if;

    if new.payment_method is null
       or new.payment_method not in ('cashapp', 'zelle', 'cash')
    then
      raise exception 'Unsupported payment method.';
    end if;

    if new.payment_received_amount is null
       or new.payment_received_amount < 0
    then
      raise exception 'The recorded payment amount is invalid.';
    end if;

    if new.refund_amount is not null
       or new.refunded_at is not null
       or new.refunded_by is not null
    then
      raise exception 'Pending refunds cannot have completed refund metadata.';
    end if;
  elsif new.refund_status = 'refunded' then
    if new.status <> 'cancelled'
       or new.payment_status <> 'paid'
    then
      raise exception 'Only cancelled paid orders can be refunded.';
    end if;

    if new.payment_method is null
       or new.payment_method not in ('cashapp', 'zelle', 'cash')
    then
      raise exception 'Unsupported payment method.';
    end if;

    if new.payment_received_amount is null
       or new.payment_received_amount < 0
       or new.refund_amount is distinct from new.payment_received_amount
    then
      raise exception 'Refund amount must match the payment received.';
    end if;

    if new.refunded_at is null
       or new.refunded_by is null
    then
      raise exception 'Completed refunds require an actor and timestamp.';
    end if;
  else
    raise exception 'Invalid refund status.';
  end if;

  return new;
end;
$function$;

do $block$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.orders'::regclass
      and tgname = 'enforce_order_refund_integrity'
      and not tgisinternal
  ) then
    create trigger enforce_order_refund_integrity
    before insert or update of
      status,
      payment_status,
      payment_method,
      payment_received_amount,
      refund_status,
      refund_amount,
      refunded_at,
      refunded_by
    on public.orders
    for each row
    execute function public.enforce_order_refund_integrity();
  end if;
end;
$block$;

create or replace function public.mark_order_refunded(
  p_order_id uuid,
  p_refunded_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders%rowtype;
  v_now timestamptz := now();
begin
  if p_order_id is null or p_refunded_by is null then
    raise exception 'Invalid refund request.';
  end if;

  if not exists (
    select 1
    from public.admin_users
    where user_id = p_refunded_by
  ) then
    raise exception 'Access denied.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.refund_status = 'refunded' then
    if v_order.status = 'cancelled'
       and v_order.payment_status = 'paid'
       and v_order.payment_received_amount is not null
       and v_order.refund_amount is not distinct from v_order.payment_received_amount
       and v_order.refunded_at is not null
       and v_order.refunded_by is not null
    then
      return jsonb_build_object(
        'id', v_order.id,
        'status', v_order.status,
        'payment_status', v_order.payment_status,
        'payment_method', v_order.payment_method,
        'payment_received_amount', v_order.payment_received_amount,
        'refund_status', v_order.refund_status,
        'refund_amount', v_order.refund_amount,
        'refunded_at', v_order.refunded_at,
        'refunded_by', v_order.refunded_by,
        'updated_at', v_order.updated_at,
        'already_refunded', true
      );
    end if;

    raise exception 'This order already has a different refund record.';
  end if;

  if v_order.status <> 'cancelled' then
    raise exception 'Only cancelled orders can be refunded.';
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception 'This order was not marked paid.';
  end if;

  if v_order.payment_method is null
     or v_order.payment_method not in ('cashapp', 'zelle', 'cash')
  then
    raise exception 'Unsupported payment method.';
  end if;

  if v_order.payment_received_amount is null
     or v_order.payment_received_amount < 0
  then
    raise exception 'The recorded payment amount is invalid.';
  end if;

  if v_order.refund_status <> 'required' then
    raise exception 'This order does not require a refund.';
  end if;

  update public.orders
  set
    refund_status = 'refunded',
    refund_amount = v_order.payment_received_amount,
    refunded_at = v_now,
    refunded_by = p_refunded_by,
    updated_at = v_now
  where id = p_order_id
  returning *
  into v_order;

  return jsonb_build_object(
    'id', v_order.id,
    'status', v_order.status,
    'payment_status', v_order.payment_status,
    'payment_method', v_order.payment_method,
    'payment_received_amount', v_order.payment_received_amount,
    'refund_status', v_order.refund_status,
    'refund_amount', v_order.refund_amount,
    'refunded_at', v_order.refunded_at,
    'refunded_by', v_order.refunded_by,
    'updated_at', v_order.updated_at,
    'already_refunded', false
  );
end;
$function$;

revoke all
on function public.mark_order_refunded(uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.mark_order_refunded(uuid, uuid)
to service_role;
