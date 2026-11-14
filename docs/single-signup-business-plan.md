# Single sign-up creates the business (plan, for AJ's review)

Status: **draft, no code written.** Written 2026-11-14 from AJ's five steps. Nothing here is approved until AJ says so.

## What AJ wants

1. A person lands on a product, clicks Sign up, and fills in the Account sign-up (name, business phone number, email, password). Sign-up stays open only from a registered product (decision of 2026-11-10, unchanged).
2. They verify the email with the OTP. **At that moment the Account creates their Account and their business**, then sends them back to the product. The product shows its onboarding steps if it has any, otherwise the dashboard.
3. The person is the business's Admin from that moment.
4. The product they came from is attached to the business straight away (a trial at first), so a business always has at least one product.
5. Business details (name, address, GST and so on) belong to each product. Payment details stay in the Account, as built.

## How it works today (what is different)

| Step | Today |
|---|---|
| Sign-up and OTP | Identity is created at sign-up. The OTP only lets the person sign in. No business exists yet. |
| First sign-in at Caterly | Caterly makes its own user, then its own business called "Unnamed Business" (`provisionTenantForNewUser`), then tells the Platform with `business.created`. |
| Admin and product link | The Platform creates the organisation, the Admin and the product link only when that `business.created` arrives. |
| Trial | Caterly tells Ops with `business.signed_up`, and Ops starts the trial. |

So today **the product creates the business and the Platform learns about it**. AJ's model reverses that: the Platform creates it and the product adopts it.

## What already exists and can be reused

| Piece | Where | What it does |
|---|---|---|
| `createOrganisation` | `apps/platform/src/modules/organisations/create.ts` | Makes the organisation, the product link, the creator as first Admin, the slot and the audit row in one transaction. It can mint a new business id. |
| `organisation.link` command (receiver) | `src/modules/platform-link/commands.ts` | Caterly adopts a business id and name and makes an empty organisation with no users. Safe to repeat. |
| `membership.changed` and pending member | `src/modules/platform-link/membership.ts`, `pending.ts` | A person the Platform has already made a member joins that business at their first central sign-in, as owner when they are the Admin. Caterly then skips making a tenant of its own. |
| Rename sync | `business.updated` and `business-renamed.ts` | Caterly's onboarding name reaches the Platform, Account, Store and Ops. |
| Ops trial | `business.signed_up` in `apps/ops/src/modules/directory/events.ts` | Starts the trial when it first hears of a business. |

## What is missing

| Gap | Why it matters |
|---|---|
| **A Platform sender for `organisation.link`** | The Platform only receives from products today. Nothing on the Platform sends this command, so a business created at verification could not reach Caterly. |
| **A hook at email verification** | Nothing runs when the OTP is accepted. It must create the Platform user, the business, the Admin and the product link, and queue the link and membership messages. |
| **Remembering which product the sign-up came from** | The sign-up gate already knows the product (`x-platterly-client`), but does not keep it. The verification hook needs it. |
| **Caterly must never create its own business for a central sign-in** | Otherwise a fast first sign-in makes a second business next to the Platform's. |
| **Ops trial start** | Ops starts the trial on `business.signed_up`. Caterly sends that only from auto-provision, so the adopt path must also send it once the owner has joined. To be checked in the code before building. |

## Target order of events

1. Sign-up form posts to the identity provider. The chosen product (client id) is saved with the new identity.
2. Person enters the OTP. On success the hook runs:
   1. Find or create the Platform user (`findOrCreateBySubject`, linked by subject, never by email).
   2. `createOrganisation` with a minted business id, a placeholder name, the saved product, and the person as Admin. One transaction, idempotent by a key made from the subject and product.
   3. Queue `organisation.link` and `membership.changed` for that product.
3. The Platform tries to deliver both to the product at once (short timeout). A failure is retried by the outbox, as `business.created` is today.
4. The person is redirected back to the product and signs in centrally. Caterly finds the pending owner membership, joins them to the adopted business, skips making a tenant, and sends `business.signed_up` so Ops starts the trial.
5. Caterly shows its onboarding or the dashboard. The onboarding name goes back through the existing rename sync.

## The race to decide

If the person reaches Caterly before the link arrives, Caterly has nothing to adopt. Three options:

| Option | Behaviour | Verdict |
|---|---|---|
| A. Caterly makes its own business as today | Creates a duplicate next to the Platform's | Rejected: breaks the whole point |
| B. Caterly shows "Setting up your account" and retries for a short time | No duplicate; a brief wait in the rare slow case | **Recommended** |
| C. Caterly asks the Platform at that moment ("which business is this person's?") | Fast and exact, but a new pull route and secret | Possible later if B proves slow |

Recommendation: B, with the Platform's immediate delivery in step 3 making the wait rare.

## Build steps (each small, each proven before the next)

1. **Keep the product with the sign-up.** Save the client id on the new identity (or in a Platform table keyed by subject). Test: sign-up from Caterly records `catering`.
2. **Platform sender for `organisation.link`** through the existing outbox, with the product's signed secret. Test: unit test against a stand-in product, plus a signed answer check.
3. **Verification hook** creating user, business, Admin and product link, then queuing link and membership. Test: Playwright sign-up and OTP shows an Account with a business and Caterly attached, before any Caterly sign-in.
4. **Caterly: no own business for a central sign-in** when the Platform owns it; show "Setting up your account" and retry if the link has not arrived; send `business.signed_up` after joining. Test: Caterly spec for sign-up through the central page, one business only.
5. **Back-compat for existing businesses.** Businesses made the old way keep working unchanged. Test: an existing signed-in Admin still reaches Caterly.
6. **End-to-end run** on throwaway databases: Caterly, Platform, Ops, mail sink. Sign up, verify, land in Caterly, one business, one Admin, trial started, Store shows the business.

## Failure cases to prove

| Case | Expected |
|---|---|
| OTP verified twice, or the hook retried | Same business, nothing doubled (idempotency key) |
| Product not registered, or not current | Business still created, product link queued and retried; the person sees a clear message |
| Caterly unreachable at verification | Outbox retries; person waits on "Setting up your account" until it lands |
| Person already holds a seat for that product elsewhere | Refused cleanly (existing rule) |
| Person abandons after verifying | An Account and a business with a trial and no onboarding, which is fine |
| Sign-up with no product | Still refused (gate unchanged) |

## Decisions recorded

- Sign-up only from a registered product: unchanged.
- No business-name field at sign-up: the business starts with a placeholder name and the product's onboarding supplies the real one through the rename sync (AJ, 2026-11-14).
- Business details belong to each product; payment details stay in the Account (AJ, 2026-11-14).

## Open for AJ

1. Approve option B for the race.
2. Approve the build order above.
3. What should the placeholder name be on the Platform ("Unnamed Business" as today, or the person's name)?
