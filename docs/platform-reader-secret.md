# The platform-reader secret (Ops, F6.1.0)

What it is: the shared secret the Platform signs its `GET /api/platform/products` requests with, and Ops signs the answer with (`docs/platform-foundation-plan.md` section 5a). It is separate from every product's command secret. Ops needs it in readable form to sign answers, so it is stored encrypted (AES-256-GCM, key `OPS_SECRETS_KEY`; in development `BETTER_AUTH_SECRET` is the fallback). **Production must set `OPS_SECRETS_KEY`.**

## How it is handled
| Rule | How it is kept |
|---|---|
| Created only by an operator | `npm --prefix apps/ops run platform-reader -- provision`. A request never creates it: until it exists, the endpoint answers 401 to everyone. |
| Never shown | The tool writes the secret to one file and prints only where. It is not printed, logged, passed as an argument, returned over HTTP, put in an audit row or stored in plaintext. |
| The file | Mode 600, in a directory that must be mode 700 and yours (`~/.platterly/` by default, created for you). Created exclusively: it never overwrites a file and never follows a link. If the database change then fails, the tool removes its own file. |
| Concurrency | Provisioning relies on the table's unique key; rotation is a compare-and-swap. Of any number of simultaneous runs exactly one succeeds and the others change nothing. |
| Audit | `platform_reader.provisioned`, `.rotated`, `.rotation_finished`, written in the same transaction as the change (no audit row, no change). The row records the operating-system user and the output file path, never a secret. |

## Commands
Run from the repository root (the Ops `.env` supplies `DATABASE_URL` and the key).
```
npm --prefix apps/ops run platform-reader -- status
npm --prefix apps/ops run platform-reader -- provision [--out <file>]
npm --prefix apps/ops run platform-reader -- rotate    [--out <file>]
npm --prefix apps/ops run platform-reader -- finish --confirm-consumer-verified
```
| Command | Default file | Effect |
|---|---|---|
| `status` | none | Says whether a secret exists, whether a rotation is pending, when it was rotated. Never the secret. |
| `provision` | `~/.platterly/platform-reader.secret` | First secret. Refused if one already exists. |
| `rotate` | `~/.platterly/platform-reader.secret.next-<UTC time>` | A new secret; the old one stays valid. Refused while an earlier rotation is unfinished, and if no secret exists. |
| `finish` | none | The old secret stops working. Refused unless `--confirm-consumer-verified` is given, and when no rotation is pending. |

## Moving the secret to the consumer
1. Read the file on the machine that ran the tool. Put the value into the consumer's secret store (the Platform's encrypted configuration, which arrives with `F6.1.1`/`F6.1.3`).
2. Check that the consumer's signed request is answered with a 200.
3. Delete the file.
4. For a rotation only: run `finish --confirm-consumer-verified` after step 2. Until then both the old and the new secret are valid, so nothing breaks while you switch.

## The record that already exists on this machine
`platterly_ops.platform_reader` already holds one row, created 2026-11-01 by the first F6.1.0 code, which made a secret on first use and never showed it. Nobody has its plaintext, and it has never served a list (`listVersion` 0).

| Question | Answer |
|---|---|
| Does `provision` replace it? | No. `provision` refuses while any row exists, and leaves the row untouched. |
| Is it discarded? | No. It stays valid. |
| How does a consumer get a working secret? | Run `rotate`. That writes a new secret to a file; the existing one becomes the previous secret and still works. |
| When does the old one stop working? | Only when you run `finish --confirm-consumer-verified`. That is the single, audited, deliberate moment it is dropped. |
| Is it recoverable? | Until `finish`, yes: nothing about the old record was changed, and the rotation can be repeated after `finish` with another `rotate`. After `finish` the old ciphertext is gone from the table, as intended; the rows in `audit_log` remain. |

## Replay and timestamps
Requests are accepted within 300 seconds either side of the clock and are bound to the method and route, so one captured request cannot be used for another route. There is no nonce store, by decision: the route is a read-only GET and repeating a request only reads the same list. Repeats write nothing (the list version changes only when the list itself changes).

## HTTPS
In production a request is refused unless it came through the proxy over https: Nginx sets `X-Forwarded-Proto https` (`deploy/nginx/platterly.conf`), and a missing header counts as not https. In development the header is not required.

## The proxy
Only the exact path `/api/platform/products` skips the staff-login redirect (`apps/ops/src/proxy.ts`). Every other path under `/api/platform` redirects to sign-in without a session. The route authenticates by its HMAC signature.

## Tests
`apps/ops/src/modules/platform-list/__tests__/` and `apps/ops/src/__tests__/proxy.test.ts`. The platform-list tests **delete the reader row** and its audit rows, so they refuse to run unless `DATABASE_URL` names a scratch database (name contains `test`). Make one with `createdb platterly_ops_x_test`, copy the schema and data with `pg_dump platterly_ops | psql platterly_ops_x_test`, grant the app role access (`GRANT ALL ON ALL TABLES IN SCHEMA public TO platterly_app`), and run `DATABASE_URL=<scratch url> npx vitest run src/modules/platform-list src/__tests__/proxy.test.ts`.

## Not part of F6.1.0
The optional signed `product.changed` ping is deferred to `F6.1.3`, when the Platform has a receiver.
