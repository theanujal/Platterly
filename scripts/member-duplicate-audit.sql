-- F8.2.3a: Caterly Member duplicate audit (docs/platform-foundation-plan.md, Part 3 section 13, step a).
-- READ-ONLY. Run it on a local COPY of the dev database, never on the original:
--   psql "<copy database>" -f scripts/member-duplicate-audit.sql
-- Each environment is audited separately and freshly. Nothing here changes data; the transaction is read-only and is rolled back.
-- Output carries ids only (no names or emails), enough to investigate a case.
--
-- Why: a unique index on member("userId", "organizationId") is planned (F8.2.3d to g). It can only be applied where this audit
-- shows zero duplicates, or after an approved recovery plan has been carried out.

BEGIN READ ONLY;

-- 1. Totals. duplicate_combinations must be 0 for the unique index to apply.
SELECT
  now()                                                              AS audited_at,
  current_database()                                                 AS database_audited,
  count(*)                                                           AS member_records_checked,
  count(DISTINCT ("userId", "organizationId"))                       AS distinct_user_org_pairs,
  count(*) - count(DISTINCT ("userId", "organizationId"))            AS surplus_rows,
  (SELECT count(*) FROM (
     SELECT 1 FROM member GROUP BY "userId", "organizationId" HAVING count(*) > 1
   ) d)                                                              AS duplicate_combinations
FROM member;

-- 2. Every row of every duplicated (user, organisation) pair. Zero rows means no duplicates.
SELECT
  m."userId",
  m."organizationId",
  m.id           AS member_id,
  m.role,
  m."disabledAt",
  m."locationId",
  m."createdAt",
  count(*) OVER (PARTITION BY m."userId", m."organizationId") AS rows_in_pair
FROM member m
WHERE (m."userId", m."organizationId") IN (
  SELECT "userId", "organizationId" FROM member GROUP BY "userId", "organizationId" HAVING count(*) > 1
)
ORDER BY m."organizationId", m."userId", m."createdAt", m.id;

-- 3. Safety check on the audit itself: the unique index does not exist yet (if it did, step 2 could never return a row).
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'member' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%userId%' AND indexdef ILIKE '%organizationId%';

ROLLBACK;

-- =====================================================================================================================
-- F8.2.3b (added 2026-11-04): users with memberships in more than one organisation. Follow-up to the audit above, which
-- is unchanged. Same rules: READ-ONLY, run on a local COPY of the dev database only, never on the original, never against
-- staging or production data without a separate approval. Ids and counts only, no names or emails.
--
-- Why: decision D15 allows at most one membership per user per product. Caterly is one product, so any user with
-- memberships in two or more organisations would collide with the planned slot rule (`membership_product_slots`,
-- UNIQUE (user_id, product_key)) when Caterly data is imported. This query shows how many there are before any import design.
-- =====================================================================================================================

BEGIN READ ONLY;

-- 4. Totals. users_with_multiple_organisations must be 0 for D15 to apply to this data without a recovery plan.
--    "active" excludes disabled members (disabledAt set); a disabled member keeps the slot under D15 (C8), so the
--    "all rows" columns decide the verdict and the "active" columns are shown for context.
WITH per_user AS (
  SELECT
    "userId",
    count(DISTINCT "organizationId")                                        AS organisations_all,
    count(DISTINCT "organizationId") FILTER (WHERE "disabledAt" IS NULL)    AS organisations_active
  FROM member
  GROUP BY "userId"
)
SELECT
  now()                                                                     AS audited_at,
  current_database()                                                        AS database_audited,
  (SELECT count(*) FROM "user")                                             AS users_total,
  (SELECT count(*) FROM member)                                             AS member_records,
  count(*)                                                                  AS users_with_any_membership,
  (SELECT count(*) FROM "user") - count(*)                                  AS users_with_no_membership,
  count(*) FILTER (WHERE organisations_all > 1)                             AS users_with_multiple_organisations,
  count(*) FILTER (WHERE organisations_active > 1)                          AS users_with_multiple_active_organisations,
  coalesce(max(organisations_all), 0)                                       AS most_organisations_for_one_user
FROM per_user;

-- 5. Every membership of every user who belongs to more than one organisation. Zero rows means none.
SELECT
  m."userId",
  m."organizationId",
  m.id           AS member_id,
  m.role,
  m."disabledAt",
  m."locationId",
  m."createdAt",
  multi.organisations_for_user
FROM member m
JOIN (
  SELECT "userId", count(DISTINCT "organizationId") AS organisations_for_user
  FROM member GROUP BY "userId" HAVING count(DISTINCT "organizationId") > 1
) multi ON multi."userId" = m."userId"
ORDER BY m."userId", m."createdAt", m.id;

-- 6. Distribution: how many users have 1, 2, 3 ... organisations. Counts only.
SELECT organisations_for_user, count(*) AS users
FROM (
  SELECT "userId", count(DISTINCT "organizationId") AS organisations_for_user FROM member GROUP BY "userId"
) t
GROUP BY organisations_for_user
ORDER BY organisations_for_user;

-- 7. Members whose user or organisation row is missing (orphans). Both foreign keys cascade, so 0 is expected; shown so the
--    totals above can be trusted.
SELECT
  count(*) FILTER (WHERE u.id IS NULL) AS members_without_user,
  count(*) FILTER (WHERE o.id IS NULL) AS members_without_organisation
FROM member m
LEFT JOIN "user" u ON u.id = m."userId"
LEFT JOIN organization o ON o.id = m."organizationId";

ROLLBACK;
