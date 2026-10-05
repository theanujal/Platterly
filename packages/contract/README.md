# @platterly/contract

Shared types, parsers and signing for the ops <-> product contract. The rules live in `docs/ops-contract.md`; this folder is the only place the shapes are defined, so ops and every product import them from here.

- `signing`: sign and verify requests (same HMAC scheme as the Chunk 25 webhooks), with secret rotation.
- `manifest`: what a product publishes (entitlement keys, trial defaults) and `validateEntitlements`.
- `snapshot`: the entitlement snapshot, `evaluateAccess` (5-day grace), limit and flag helpers.
- `messages`: commands (ops to product) and events (product to ops) with parsers.
- Parsers never throw on bad input; they return `{ ok, value | error }`.

It is a plain folder, not an npm workspace: apps import it by path (`packages/contract/index.ts`). Pure TypeScript, only `node:crypto`, no database. Tests: `npm run test` (picked up from `packages/**`).
