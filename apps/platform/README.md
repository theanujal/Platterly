# Platterly Platform

One app serving three hosts: `auth.localhost:3300`, `account.localhost:3300` and `store.localhost:3300` (decision D8). Own database `platterly_platform` and own database role. Plan: `docs/platform-foundation-plan.md`. Audit: `docs/platform-audit.md`.

## Local environment (decision D14, approved)
| Service | Port | Start |
|---|---|---|
| Caterly (catering) | 3000 | `npm run dev` at the repository root |
| Site | 3100 | `npm --prefix apps/site run dev` |
| Ops | 3200 | `npm --prefix apps/ops run dev` |
| Platform | 3300 | `npm --prefix apps/platform run dev` |
| Stub product | 3500 | not built yet |
| Mail sink | 3600 | `npm run mail-sink` (approved by AJ, 2026-11-01) |

- `npm run dev:all` starts the mail sink and every app that is not already listening, and points catering and Ops at the sink (`ZEPTOMAIL_API_URL`), so no email leaves the machine. Messages are kept in `.data/mail-sink/` and listed at http://localhost:3600/.
- `npm run smoke:local` checks every health address. `npm run seed:local` seeds the catering library and dev plan (Platform has no tables yet).
- Database: create role `platterly_platform_app` (LOGIN CREATEDB) and database `platterly_platform` owned by it, then copy `.env.example` to `.env`. `npx prisma migrate deploy` applies the migrations.
- Sessions are host-only: nothing here ever sets a cookie `Domain`.

## Why `src/instrumentation.ts` exists
It is a temporary one-line stub (approved by AJ, 2026-11-01). The bundler root is the repository root (so shared packages can be imported), and with it Next.js loaded the catering app's `src/instrumentation.ts`, which imports Sentry code Platform does not have; every page answered 500. The stub lives only in `apps/platform`. Caterly's Sentry and instrumentation are untouched. Platform's own monitoring replaces it in phase `F10.2.2`.
