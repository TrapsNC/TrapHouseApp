-- Commit order creation, inventory reservation, ID attachment and pending-pointer
-- removal together. Only the server role may invoke this entry point.
begin;
create or replace function public.create_customer_order_with_id(
  p_request_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_fulfillment text,
  p_delivery_address text,
  p_items jsonb,
  p_expected_subtotal numeric,
  p_payment_method text
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_upload public.pending_id_uploads%rowtype;
  v_order public.orders%rowtype;
  v_rows integer;
begin
  if p_request_id is null or p_payment_method is null
     or p_payment_method not in ('cashapp', 'zelle', 'cash') then
    raise exception 'Invalid payment method or request ID.';
  end if;

  -- Serialize retries for this request, including after its pointer is consumed.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  if exists(select 1 from public.orders where request_id = p_request_id) then
    raise exception 'This request has already been submitted';
  end if;

  select * into v_upload from public.pending_id_uploads
  where request_id = p_request_id for update;
  if not found or nullif(trim(v_upload.storage_path), '') is null then
    raise exception 'Please securely upload your government-issued ID before submitting the order.';
  end if;
  if v_upload.created_at is null or v_upload.created_at < clock_timestamp() - interval '1 hour'
     or v_upload.created_at > clock_timestamp() then
    raise exception 'Your ID upload expired. Please upload it again.';
  end if;

  perform public.create_customer_order(
    p_request_id, p_customer_name, p_customer_email, p_customer_phone,
    p_fulfillment, p_delivery_address, p_items, p_expected_subtotal
  );
  update public.orders set
    payment_method = p_payment_method,
    id_document_path = v_upload.storage_path,
    id_uploaded_at = v_upload.created_at,
    id_review_status = 'pending',
    updated_at = clock_timestamp()
  where request_id = p_request_id returning * into v_order;
  if not found then raise exception 'Order ID attachment failed.'; end if;

  delete from public.pending_id_uploads where request_id = p_request_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Pending ID cleanup failed.'; end if;

  -- Return only the public receipt fields, never the private ID storage path.
  return jsonb_build_object(
    'id', v_order.id, 'order_number', v_order.order_number,
    'tracking_token', v_order.tracking_token, 'subtotal', v_order.subtotal,
    'delivery_fee', v_order.delivery_fee, 'total', v_order.total,
    'status', v_order.status, 'fulfillment', v_order.fulfillment,
    'payment_status', v_order.payment_status, 'payment_method', v_order.payment_method,
    'id_review_status', v_order.id_review_status, 'created_at', v_order.created_at
  );
end;
$function$;
revoke all on function public.create_customer_order_with_id(uuid,text,text,text,text,text,jsonb,numeric,text)
from public, anon, authenticated;
grant execute on function public.create_customer_order_with_id(uuid,text,text,text,text,text,jsonb,numeric,text)
to service_role;
commit;
