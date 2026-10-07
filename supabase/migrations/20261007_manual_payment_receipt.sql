begin;
alter table public.orders
  add column if not exists payment_method text check (payment_method in ('cashapp','zelle','cash')),
  add column if not exists payment_received_at timestamptz,
  add column if not exists payment_received_by uuid,
  add column if not exists payment_received_amount numeric(12,2) check (payment_received_amount >= 0);
commit;
