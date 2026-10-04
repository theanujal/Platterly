# Data Safety: updates must never lose a kitchen's data

Rule: **a release may add things; it may not remove or rewrite what kitchens already have.**

## Schema changes (expand, then contract)
| Step | Rule |
|---|---|
| Add | New tables, new nullable columns, or columns with a default. Safe in one release. |
| Replace | Add the new column, backfill it, switch the code to read it. Keep the old column for at least one release. |
| Remove | Only in a later release, after a backup, and only for data copied elsewhere or confirmed empty. Needs `-- data-safe-approved: <reason>` in the migration. |
| Rename / change type / make required | Treat as add + backfill + switch; never in place. |

`npm run check:migrations` (also run in CI before `migrate deploy`) fails any migration newer than `scripts/migrations-baseline.txt`
that drops, truncates, deletes, retypes, renames, makes a column required, rewrites rows or adds a cascading delete, unless it carries an approval line.
Migrations before the baseline were written before launch and are grandfathered.

## Deploying
| Step | Command / rule |
|---|---|
| 1. Backup | `DATABASE_URL=... npm run db:backup` (writes `backups/*.sql.gz`, git-ignored). Required before any deploy that includes a migration. |
| 2. Apply | `npx prisma migrate deploy` only. Never `migrate dev`, `migrate reset` or `db push` against production. |
| 3. Verify | Spot-check row counts of kitchens, customers, orders, payments before and after. |
| 4. Roll back | Restore the backup into a scratch database first, then switch; keep the previous release available. |

## Code that deletes
Only the explicit paths delete a kitchen's data: deleting a record by its owner, the tenant purge (`src/lib/tenant-purge/`), and the scheduled scrubs
(visitor IPs after 90 days, delivery logs, idempotency keys). A new feature must not add another bulk delete without AJ's approval.
Foreign keys: a new relation to tenant data uses `SetNull` or `Restrict`, not `Cascade`, unless the child row has no meaning without its parent.

## Backups and restore drill
Daily automated Postgres backup on the server plus the pre-deploy backup above. Test a restore into a scratch database at least once before launch
and after any change to the backup method. A backup that has never been restored is not a backup.
