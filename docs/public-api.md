# Platterly Public API (v1)

Base URL: `https://catering.platterly.in/api/v1`. Machine-readable spec: `GET /api/v1/openapi.json` (no key needed).

## Authentication
Owner creates a key in **Settings → Integration → API & Webhooks**. The key is shown once; only its prefix is stored afterwards (hash at rest).
Send `Authorization: Bearer plt_live_<prefix>_<secret>`. The kitchen is taken from the key, never from the request.
Revoked keys fail immediately (`401 API_KEY_REVOKED`). Max 20 active keys per kitchen.

## Scopes
Each key carries scopes such as `menus:read`, `customers:read`, `customers:write`, `orders:read`, `orders:write`, `events:read`.
A call outside the key's scopes returns `403 INSUFFICIENT_SCOPE`. See openapi.json for the exact list.

## Responses
- Success: `{ "data": ... }`; lists add `{ "meta": { page, page_size, total } }` (default 25, max 100).
- Error: `{ "error": { "code", "message", "details" } }`. Fields are snake_case. Unknown request fields are rejected (400).
- Internal fields (kitchen notes, costs) are never returned.

## Rate limits
120 requests/minute per key and 600/minute per kitchen. Headers: `X-RateLimit-Limit/Remaining/Reset`; exceeded → `429`.
The limiter is in memory per process (single VPS instance). Move to a shared store before running more than one instance.

## Idempotency
Send `Idempotency-Key: <unique>` on POST. The same key with the same body replays the first response for 24 hours.

## Writes
Customers (create/update, duplicate phone → `409 CUSTOMER_ALREADY_EXISTS`) and orders (create/update). Order totals are computed from the
catalog; the client cannot set prices. Meal plans can change only while the order is `PENDING_REVIEW` (`409 MEAL_PLAN_LOCKED`);
cancelled/completed orders are `409 ORDER_CLOSED`. Foreign ids (customer, event type, kitchen) from another tenant are rejected.
