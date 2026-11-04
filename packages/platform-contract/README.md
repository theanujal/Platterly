# @platterly/platform-contract

Shared shapes, parsers and signing helpers for the Platform <-> product channel: the events Platform Core sends, the commands it gives a product, the sign-in token claims, organisation claims and per-business sequence numbers. The rules live in `docs/platform-foundation-plan.md` (Part 1 sections 2, 4 and 12; phases `F1.2.1`, `F6.2`, `F6.3`); this folder is the only place the shapes are defined.

- `version`: `PLATFORM_CONTRACT_VERSION`, the delivery backoff schedule and the 7-day delivery window.
- `events`: `membership.changed`, `organisation.status`, `owner.changed` in one envelope (event id, business id, per-business sequence).
- `sequence`: `shouldApply`, the rule consumers use to ignore a repeated or older event.
- `claims`: the minimal ID-token claims (`sub`, email, verified, name, `membership_version`) and organisation-claim shapes.
- `links`: the `organisation.link` command a product receives and the answer it gives.
- `signing`: route-bound HMAC signing for this channel. It reuses `packages/contract` (`v2`, `<timestamp>.<METHOD>.<path+query>.<body>`, 300 s window) and refuses a request that is not bound to a route.

Like `packages/contract` it is a plain folder, not an npm workspace, and parsers never throw on bad input: they return `{ ok, value | error }`. Pure TypeScript, no database. Product code is not part of this package. Tests: `npm run test` at the repository root (picked up from `packages/**`).
