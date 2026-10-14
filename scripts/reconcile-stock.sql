-- Read-only. Stock reconciliation for every business (the SQL form of findStockMismatches plus the ledger and allocation checks).
--   psql "${DATABASE_URL%%\?*}" -v ON_ERROR_STOP=1 -f scripts/reconcile-stock.sql
-- One row per problem; NO ROWS = reconciled. It changes nothing, and nothing here is ever "fixed" automatically.
-- severity STOP     = the numbers contradict each other: do not go live / do not continue until a person has explained it.
-- severity LEGACY   = stock on hand that is in no batch (written before batches existed). Expected after an upgrade of a business that had stock;
--                     its cost is unknown and stays unknown. A person may give it an opening batch in the app (Batches -> Record opening batch).
-- severity INFO     = batches whose cost is unknown (opening stock, Stock In marked unknown): valued as quantity only, never as money.
SET default_transaction_read_only = on;

WITH
batched AS (
  SELECT i."id", i."organizationId", i."name", i."stockCount", COALESCE(SUM(b."remainingQuantity"), 0) AS batched
  FROM "inventory" i LEFT JOIN "stock_batch" b ON b."inventoryId" = i."id"
  GROUP BY i."id"
),
ledger AS (
  SELECT t."inventoryId", SUM(CASE WHEN t."type" = 'STOCK_OUT' THEN -t."quantity" ELSE t."quantity" END) AS net
  FROM "inventory_transaction" t GROUP BY t."inventoryId"
),
taken AS (
  SELECT a."batchId",
         SUM(CASE WHEN t."type" = 'STOCK_OUT' OR (t."type" = 'ADJUSTMENT' AND t."quantity" < 0) THEN a."quantity"
                  WHEN t."type" = 'STOCK_IN' AND t."orderId" IS NOT NULL THEN -a."quantity"
                  ELSE 0 END) AS net_out
  FROM "stock_allocation" a JOIN "inventory_transaction" t ON t."id" = a."transactionId"
  WHERE a."batchId" IS NOT NULL GROUP BY a."batchId"
)
SELECT * FROM (
  SELECT 'count_vs_batches' AS "check", 'LEGACY' AS severity, b."organizationId", b."id" AS record_id, b."name",
         'on hand ' || b."stockCount" || ', in batches ' || b.batched || ', no batch ' || (b."stockCount" - b.batched) AS detail
  FROM batched b WHERE b."stockCount" > b.batched
  UNION ALL
  SELECT 'count_vs_batches', 'STOP', b."organizationId", b."id", b."name",
         'batches hold ' || b.batched || ' but on hand is ' || b."stockCount" || ' (batches exceed the count by ' || (b.batched - b."stockCount") || ')'
  FROM batched b WHERE b."stockCount" < b.batched
  UNION ALL
  SELECT 'count_vs_ledger', 'STOP', b."organizationId", b."id", b."name",
         'on hand ' || b."stockCount" || ', ledger nets to ' || COALESCE(l.net, 0)
  FROM batched b LEFT JOIN ledger l ON l."inventoryId" = b."id" WHERE b."stockCount" <> COALESCE(l.net, 0)
  UNION ALL
  SELECT 'batch_out_of_range', 'STOP', s."organizationId", s."id", s."inventoryId",
         'remaining ' || s."remainingQuantity" || ', original ' || s."originalQuantity"
  FROM "stock_batch" s WHERE s."remainingQuantity" < 0 OR s."remainingQuantity" > s."originalQuantity"
  UNION ALL
  SELECT 'batch_vs_allocations', 'STOP', s."organizationId", s."id", s."inventoryId",
         'remaining ' || s."remainingQuantity" || ', original ' || s."originalQuantity" || ' less taken ' || COALESCE(k.net_out, 0)
  FROM "stock_batch" s LEFT JOIN taken k ON k."batchId" = s."id"
  WHERE s."remainingQuantity" <> s."originalQuantity" - COALESCE(k.net_out, 0)
  UNION ALL
  SELECT 'allocations_vs_ledger_row', 'STOP', i."organizationId", t."id", i."name",
         'ledger row ' || t."type" || ' ' || t."quantity" || ', allocations ' || SUM(a."quantity")
  FROM "inventory_transaction" t JOIN "stock_allocation" a ON a."transactionId" = t."id" JOIN "inventory" i ON i."id" = t."inventoryId"
  GROUP BY t."id", t."type", t."quantity", i."organizationId", i."name" HAVING SUM(a."quantity") <> ABS(t."quantity")
  UNION ALL
  SELECT 'receipt_line_vs_batch', 'STOP', r."organizationId", l."id", l."inventoryId",
         CASE WHEN s."id" IS NULL THEN 'receipt line has no batch' ELSE 'line ' || l."quantity" || ' @ ' || l."unitCost" || ', batch ' || s."originalQuantity" || ' @ ' || COALESCE(s."unitCost"::text, 'unknown') END
  FROM "goods_receipt_line" l JOIN "goods_receipt" r ON r."id" = l."receiptId" LEFT JOIN "stock_batch" s ON s."receiptLineId" = l."id"
  WHERE s."id" IS NULL OR s."originalQuantity" <> l."quantity" OR s."unitCost" IS DISTINCT FROM l."unitCost"
  UNION ALL
  SELECT 'unknown_cost_batch', 'INFO', s."organizationId", s."id", s."inventoryId",
         s."source" || ' batch, ' || s."remainingQuantity" || ' remaining, cost unknown'
  FROM "stock_batch" s WHERE s."unitCost" IS NULL AND s."remainingQuantity" > 0
) problems
ORDER BY CASE severity WHEN 'STOP' THEN 0 WHEN 'LEGACY' THEN 1 ELSE 2 END, "check", "organizationId";

