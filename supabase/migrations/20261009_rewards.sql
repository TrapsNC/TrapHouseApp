-- Rewards accounts and consent are private. Only server-side authenticated routes access them.
begin;
create table if not exists public.reward_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null unique,
 name text not null default '',
 email_offers boolean not null default false,
 email_frequency text not null default 'occasional' check (email_frequency in ('daily','occasional')),
 consent_at timestamptz,
 unsubscribe_token uuid not null default gen_random_uuid() unique,
 created_at timestamptz not null default now()
);
create table if not exists public.reward_entries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.reward_members(user_id),
 source text not null unique,
 points integer not null,
 amount_cents integer not null default 0 check(amount_cents >= 0),
 note text not null default '',
 actor uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.reward_campaigns (
 id uuid primary key default gen_random_uuid(),
 subject text not null,
 message text not null,
 audience text not null default 'occasional' check(audience in ('daily','occasional')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.reward_members enable row level security;
alter table public.reward_entries enable row level security;
alter table public.reward_campaigns enable row level security;
revoke all on public.reward_members,public.reward_entries,public.reward_campaigns from anon,authenticated;
grant all on public.reward_members,public.reward_entries,public.reward_campaigns to service_role;

-- Idempotent, server-only synchronization awards merchandise subtotal points after payment.
-- It reverses the award once a refund is recorded.
create or replace function public.sync_order_reward(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; member uuid; earned integer;
begin
 select * into o from public.orders where id=p_order;
 if not found or o.payment_status <> 'paid' then return; end if;
 select user_id into member from public.reward_members where email=lower(trim(o.customer_email));
 if member is null then return; end if;
 perform 1 from public.reward_members where user_id=member for update;
 earned := greatest(0,floor(o.subtotal)::integer);
 insert into public.reward_entries(user_id,source,points,amount_cents,note)
 values(member,'order:'||o.id,earned,greatest(0,round(o.subtotal*100)::integer),'Online order '||o.order_number)
 on conflict(source) do nothing;
 if o.refund_status = 'refunded' then
  insert into public.reward_entries(user_id,source,points,note)
  select member,'refund:'||o.id,-points,'Refund for '||o.order_number
  from public.reward_entries where source='order:'||o.id
  on conflict(source) do nothing;
 end if;
end $$;
create or replace function public.update_order_reward() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform public.sync_order_reward(new.id); return new; end $$;
drop trigger if exists reward_order_update on public.orders;
create trigger reward_order_update after insert or update of payment_status,refund_status on public.orders
for each row execute function public.update_order_reward();
create or replace function public.join_rewards(p_user uuid,p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare oid uuid;
begin
 insert into public.reward_members(user_id,email) values(p_user,lower(trim(p_email)))
 on conflict(user_id) do update set email=excluded.email;
 for oid in select id from public.orders where lower(trim(customer_email))=lower(trim(p_email)) and payment_status='paid'
 loop perform public.sync_order_reward(oid); end loop;
end $$;
create or replace function public.record_reward_sale(p_user uuid,p_actor uuid,p_key uuid,p_cents integer,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if p_cents < 1 or p_cents > 10000000 then raise exception 'Invalid sale amount'; end if;
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'Forbidden'; end if;
 perform 1 from public.reward_members where user_id=p_user for update;
 if not found then raise exception 'Member not found'; end if;
 insert into public.reward_entries(user_id,source,points,amount_cents,note,actor)
 values(p_user,'store:'||p_key,floor(p_cents/100.0)::integer,p_cents,left(p_note,200),p_actor)
 on conflict(source) do nothing;
end $$;
-- Admin redemption is a recorded $5 counter discount, never a cash payment.
create or replace function public.redeem_reward(p_user uuid,p_actor uuid,p_key uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare balance bigint;
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'Forbidden'; end if;
 perform 1 from public.reward_members where user_id=p_user for update;
 if not found then raise exception 'Member not found'; end if;
 if exists(select 1 from public.reward_entries where source='redeem:'||p_key) then return; end if;
 select coalesce(sum(points),0) into balance from public.reward_entries where user_id=p_user;
 if balance < 100 then raise exception 'At least 100 points required'; end if;
 insert into public.reward_entries(user_id,source,points,note,actor)
 values(p_user,'redeem:'||p_key,-100,'$5 discount applied in store',p_actor);
end $$;
revoke all on function public.sync_order_reward(uuid),public.update_order_reward(),public.join_rewards(uuid,text),
 public.record_reward_sale(uuid,uuid,uuid,integer,text),public.redeem_reward(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.sync_order_reward(uuid),public.join_rewards(uuid,text),
 public.record_reward_sale(uuid,uuid,uuid,integer,text),public.redeem_reward(uuid,uuid,uuid) to service_role;
commit;