# API rate limiting

Apply `supabase/migrations/20261007_api_rate_limits.sql` to the existing Supabase
project **before deploying** the route changes. No new packages or service are needed.
Use the Supabase SQL editor or your existing migration workflow. The migration is
transactional and may be rerun. It adds only limiter metadata and a service-role-only
RPC; it does not modify orders, inventory, ID uploads, or administrator permissions.

The server reuses `SUPABASE_SERVICE_ROLE_KEY` to HMAC the trusted client IP. Never
expose this key to the browser. Rotating the key resets rate-limit identities.

| Endpoint | Requests per client IP | Window |
| --- | ---: | --- |
| POST /api/orders | 5 | 10 minutes |
| POST /api/orders/id-upload | 5 | 10 minutes |
| POST /api/track | 30 | 1 minute |
| GET /api/admin/orders | 60 | 1 minute |
| POST /api/admin/orders/id | 20 | 1 minute |
| PATCH /api/admin/orders/status and /id-review combined | 30 | 1 minute |
| POST /api/admin/orders/id-cleanup | 2 | 10 minutes |

Each bucket's fixed window starts with its first request. Denied requests do not
extend the window. PostgreSQL atomically increments the counter across instances.
Fixed windows permit a burst at the boundary. Clients sharing a public IP share a
budget. These controls do not replace platform-level DDoS protection.

Guards run before body parsing, auth lookups, uploads, and order queries. Auth and
compliance checks still run for requests within the budget. The disabled order
switch is checked first and still returns its existing 503. Scheduled cleanup
GET remains protected by its existing cron secret and does not consume the manual
cleanup budget. Browser login goes directly to Supabase Auth; these guards cover
the application's admin routes, not Supabase's login endpoint.

Responses are uncached: 429 includes `Retry-After`; limiter failures return 503
with `Retry-After: 60`. A missing migration fails closed. No in-memory fallback.
On Vercel (`VERCEL=1`), only `x-vercel-forwarded-for` is trusted. IPv6 spelling is
normalized. Local development ignores forwarded headers and uses one shared
development bucket. Other production hosts need an explicit trusted IP adapter.

At most 100 limiter rows expired over an hour ago are removed per request. This
keeps maintenance bounded; idle expired rows are removed when traffic resumes.
Raw IP addresses, tokens, and tracking details are never stored in the table.

Keep `ENABLE_ORDER_REQUESTS=false` and `NEXT_PUBLIC_ENABLE_ORDER_REQUESTS=false`
in production. Do not enable orders as part of this rollout.

Validation:

- `node node_modules/typescript/bin/tsc --noEmit --incremental false`
- `node --test tests/rate-limit.test.cjs`
- After applying SQL, verify the RPC with a synthetic 64-character hex key:
  the first N calls allow, the next denies, and the budget resets after expiry.
  Confirm anon/authenticated roles cannot execute it. Live SQL validation remains
  required if no authenticated database session is available during implementation.

Verified on October 7, 2026: migration applied to project
`zdmuztpkqnegctipgpfc`. Twelve concurrent synthetic RPC calls allowed exactly five
and denied seven. The budget reset after expiry. Anonymous RPC and table access
were denied; SQL inspection confirmed RLS and blocked authenticated-role execution.
No order or ID data was accessed during these checks. Application changes are local
and still require deployment.

Files changed for this implementation:

- `lib/rate-limit.ts`
- `supabase/migrations/20261007_api_rate_limits.sql`
- `tests/rate-limit.test.cjs`
- `RATE_LIMITING.md`
- `app/api/orders/route.ts`
- `app/api/orders/id-upload/route.ts`
- `app/api/track/route.ts`
- `app/api/admin/orders/route.ts`
- `app/api/admin/orders/status/route.ts`
- `app/api/admin/orders/id/route.ts`
- `app/api/admin/orders/id-review/route.ts`
- `app/api/admin/orders/id-cleanup/route.ts` (POST only)

Existing `package.json` and `package-lock.json` working-tree modifications were
preserved; neither file was edited for rate limiting. Next.js stays at 16.4.0.
