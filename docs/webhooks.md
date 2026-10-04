# Platterly Outbound Webhooks

Add endpoints in **Settings → Integration → API & Webhooks** (max 5 per kitchen, https only).

## Events
order.created, order.updated, order.status_changed, customer.created, customer.updated, event.created, event.updated,
payment.created, payment.updated, payment.failed. Payloads are minimal (ids and status/amount); contact and payment-instrument details are never sent.

## Request
POST JSON with headers `X-Platterly-Event`, `X-Platterly-Event-Id` (`evt_<32 hex>`, use for de-duplication), `X-Platterly-Timestamp`, and
`X-Platterly-Signature: v1=<hex>` = HMAC-SHA256(secret, `"<timestamp>.<raw body>"`). Reject timestamps older than 300 seconds.
The secret (`whsec_...`) is shown once; it can be rotated.

## Delivery
Respond 2xx within the timeout. Failures retry at 1m, 5m, 30m, 2h, 12h (6 attempts in all); 4xx other than 408/429 are permanent.
After 10 consecutive failures the endpoint is switched off. The delivery log (with manual retry) is on the same screen.
Retries run from `GET /api/cron/daily` (header `Authorization: Bearer $CRON_SECRET`); schedule it frequently (every minute) for timely retries.

## Safety
Private, loopback, link-local and metadata addresses (including IPv6-wrapped IPv4) are refused when saving and again at delivery time (DNS re-check).
