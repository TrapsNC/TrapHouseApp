-- Apply before deploying the route changes. Uses the existing Supabase database.
begin;

create table if not exists public.api_rate_limit_buckets (
  scope text not null,
  client_key text not null check (client_key ~ '^[a-f0-9]{64}$'),
  hits integer not null check (hits > 0),
  expires_at timestamptz not null,
  primary key (scope, client_key)
);
create index if not exists api_rate_limit_buckets_expiry
  on public.api_rate_limit_buckets (expires_at);
alter table public.api_rate_limit_buckets enable row level security;
revoke all on public.api_rate_limit_buckets from public, anon, authenticated;

create or replace function public.consume_api_rate_limit(
  p_scope text, p_key text, p_limit integer, p_window_seconds integer
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  current_time_value timestamptz := clock_timestamp();
  bucket public.api_rate_limit_buckets%rowtype;
begin
  if p_scope is null or p_scope not in (
    'orders', 'idUpload', 'tracking', 'adminRead', 'adminId', 'adminWrite', 'adminCleanup'
  ) or p_key is null or p_key !~ '^[a-f0-9]{64}$'
    or p_limit is null or p_limit < 1 or p_limit > 1000
    or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 600 then
    raise exception 'Invalid rate limit parameters';
  end if;

  -- Bounded maintenance; only limiter metadata, never orders or ID records.
  -- SKIP LOCKED prevents cleanup requests contending on the same expired rows.
  delete from public.api_rate_limit_buckets
  where (scope, client_key) in (
    select scope, client_key from public.api_rate_limit_buckets
    where expires_at < current_time_value - interval '1 hour'
    order by expires_at limit 100 for update skip locked
  );

  -- ON CONFLICT takes a row lock: concurrent instances cannot overspend a bucket.
  insert into public.api_rate_limit_buckets as existing
    (scope, client_key, hits, expires_at)
  values (p_scope, p_key, 1, current_time_value + make_interval(secs => p_window_seconds))
  on conflict (scope, client_key) do update set
    hits = case when existing.expires_at <= current_time_value then 1
      else least(existing.hits + 1, p_limit + 1) end,
    expires_at = case when existing.expires_at <= current_time_value
      then current_time_value + make_interval(secs => p_window_seconds)
      else existing.expires_at end
  returning * into bucket;

  return jsonb_build_object(
    'allowed', bucket.hits <= p_limit,
    'retry_after_seconds', greatest(1, ceil(extract(epoch from
      (bucket.expires_at - current_time_value)))::integer)
  );
end;
$$;

-- Only the existing server-only service role may spend buckets.
revoke all on function public.consume_api_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer)
  to service_role;

commit;
