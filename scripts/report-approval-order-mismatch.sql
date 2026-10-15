-- Read-only. Orders whose status disagrees with their menu approval, and orders with no menu approval at all.
--   psql "${DATABASE_URL%%\?*}" -v ON_ERROR_STOP=1 -f scripts/report-approval-order-mismatch.sql
-- Part of the Menu Approvals + Orders merge (docs/menu-approvals-orders-merge-plan.md, Decision 4). It changes nothing,
-- and nothing here is ever "fixed" automatically: a person reviews the rows and approves any cleanup separately.
-- The CASE below is the SQL form of orderStatusForSelection / deriveOrderStatus in src/modules/orders/order-status.ts
-- (least-advanced live selection wins; CANCELLED only when every selection is cancelled).
-- kind MISMATCH     = the order has a menu selection, and Order.status is not what that selection implies.
-- kind NO_SELECTION = the order has no menu selection (no event, or an event without one).
SET default_transaction_read_only = on;

WITH
per_selection AS (
  SELECT e."orderId", m."id" AS selection_id, m."status" AS menu_status, m."kitchenProductionStatus" AS kitchen_status,
         CASE m."status"
           WHEN 'DRAFT' THEN 'PENDING_REVIEW'
           WHEN 'CHANGES_REQUESTED' THEN 'PENDING_REVIEW'
           WHEN 'SENT_TO_CUSTOMER' THEN 'AWAITING_CUSTOMER_APPROVAL'
           WHEN 'CUSTOMER_REVIEWING' THEN 'AWAITING_CUSTOMER_APPROVAL'
           WHEN 'CUSTOMER_APPROVED' THEN 'APPROVED'
           WHEN 'FINAL_LOCKED' THEN CASE m."kitchenProductionStatus"
             WHEN 'DELIVERED' THEN 'COMPLETED' WHEN 'CANCELLED' THEN 'CANCELLED' ELSE 'SENT_TO_KITCHEN' END
         END AS implied
  FROM "menu_selection" m JOIN "event" e ON e."id" = m."eventId"
  WHERE e."orderId" IS NOT NULL
),
ranked AS (
  SELECT p.*, array_position(ARRAY['PENDING_REVIEW','AWAITING_CUSTOMER_APPROVAL','APPROVED','SENT_TO_KITCHEN','COMPLETED','CANCELLED'], p.implied) AS rank
  FROM per_selection p
),
derived AS (
  SELECT "orderId",
         count(*) AS selections,
         string_agg(menu_status || '/' || kitchen_status, ', ' ORDER BY rank) AS selection_states,
         COALESCE(
           (ARRAY_AGG(implied ORDER BY rank) FILTER (WHERE implied <> 'CANCELLED'))[1],
           'CANCELLED') AS expected
  FROM ranked GROUP BY "orderId"
)
SELECT 'MISMATCH' AS kind, o."organizationId", o."id" AS order_id, o."orderNumber", o."status"::text AS order_status,
       d.expected AS expected_status, d.selections, d.selection_states AS menu_status_kitchen_stage,
       o."eventEndDate"::date AS event_end, o."createdAt"::date AS created
FROM "order" o JOIN derived d ON d."orderId" = o."id"
WHERE o."status"::text <> d.expected
UNION ALL
SELECT 'NO_SELECTION', o."organizationId", o."id", o."orderNumber", o."status"::text, NULL, 0, NULL,
       o."eventEndDate"::date, o."createdAt"::date
FROM "order" o
WHERE NOT EXISTS (SELECT 1 FROM per_selection p WHERE p."orderId" = o."id")
ORDER BY 1, 2, 10, 4;
