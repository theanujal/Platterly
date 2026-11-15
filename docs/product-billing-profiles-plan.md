# Product billing profiles: plan for review

Status: PLAN ONLY. Nothing here is built. Written 2026-11-15 after AJ's note that billing information must be kept separately for each product.

## 1. What exists today

| Where | What it holds | Key |
|---|---|---|
| Account > Billing Details (built 2026-11-15) | one form: business name, contact person, billing email, billing phone, address lines 1-2, city, state, PIN, country, GSTIN | one record per **business** |
| Ops table `billing_customer` | the same fields, plus `source` (payment or account) | `businessId` only |
| Ops invoice | a frozen copy of the buyer on each paid payment (`invoiceSnapshot`) | per payment, never rewritten |
| Caterly > Settings > Account > Business Profile | business name, description, street address, city, state, ZIP, country, mobile, website, Instagram, Facebook, order-number prefix / next value / digits, logo | Caterly's `Organization` row |
| Caterly > Settings > Integration > Payments | GST number, show GST on invoices | same `Organization` row (`gstNumber`) |
| Caterly > Organization columns with no screen found | owner first/last name, contact email, address line 2 | same row |

Today the two sides share nothing except the business **name**, which Caterly pushes to the Platform when it is renamed. A second product (Rivo) would have to share Caterly's one billing record, which is the problem you described.

## 2. Field inventory: what each side has and what is missing

| Field | Business profile (product) | Billing profile (Account) | Proposed home |
|---|---|---|---|
| Business / legal name | yes | yes | shared |
| Brand (trade) name | no | no | **add**, business profile only |
| Logo | yes | no | business profile only |
| Description | yes | no | business profile only |
| Website, Instagram, Facebook | yes | no | business profile only |
| Business contact phone | yes (mobile) | yes (billing phone) | two fields: business phone (profile), billing phone (billing) |
| Business contact email | column, no screen | yes (billing email) | two fields: business email (profile), billing email (billing) |
| Billing contact person | no | yes | billing only |
| Address line 1 | yes | yes | shared |
| Address line 2 | no | yes | shared, **add to Caterly** |
| City, state, PIN, country | yes (free text) | yes (dropdowns) | shared, same dropdowns in both |
| GSTIN | yes (Payments settings) | yes | shared |
| GST registration type (regular, composition, unregistered) | no | no | **add**, billing only |
| PAN | no | no | **add**, billing only (optional) |
| Billing CC email | no | no | **add**, billing only (optional) |
| Customer reference / PO text for invoices | no | no | **add**, billing only (optional) |
| Show GST on invoices | yes | no | Caterly only (its own customer invoices) |
| Order numbering | yes | no | Caterly only |

"Shared" means one stored value that both screens show and edit. Everything else belongs to one screen only.

## 3. Recommended design

### 3.1 One canonical record per product
`product_billing_profile`, keyed by (`businessId`, `productKey`). Billing Details becomes **Billing Profiles**: a list of the products the business uses, then one form per product.

The shared fields and the billing-only fields live in this one record. The product's own Business Profile keeps only its product-only fields (logo, description, links, order numbering) in its own database.

### 3.2 Where it lives (decision needed, see section 6)
Recommended: **Ops stays the home**, because it already holds the billing record, the audit log, the signed channels to both Platform and the products, and the frozen invoices. It is extended from one row per business to one row per business and product.

Alternative: the Platform holds it. That would add a third system to the billing path and move the invoice source, so it is not recommended.

### 3.3 Both screens edit the same record
- The Account page saves through the Platform to Ops, as it does now.
- Caterly's Business Profile saves the shared fields to Ops through a signed call, and its product-only fields locally. A save that touches both is done in that order; if Ops refuses (for example a version conflict) nothing local changes.
- Caterly keeps a **read copy** of the shared fields in its own `Organization` row so its own invoices and storefront never wait on Ops. Ops pushes a signed `billing_profile.changed` event to the product after every save, and Caterly also refreshes the copy each time the Business Profile page opens. The copy is never edited directly.

### 3.4 Version checks
Each record has a `version` number. Every save sends the version it was based on. Ops refuses a stale save and returns the current record; the screen shows "This was changed elsewhere (Account or Caterly) at 3:42 pm. Review the new values." and keeps the person's edits for them to reapply.

### 3.5 Audit
Every change writes an Ops audit row: who, from where (Account or the product), when, the field names changed, and old and new values (GSTIN and contact details included; nothing secret is stored here). The Account page shows "Last changed by X in Caterly on date".

### 3.6 Invoices
Unchanged and kept: a paid payment freezes its own copy of the buyer into the invoice. Saving a profile never touches an issued invoice. The next payment uses the profile as it is at that moment.

### 3.7 Existing data
One migration copies each business's current billing record into a (`businessId`, product) row for every product the business uses today (Caterly only, for now), then a one-time pull fills the shared fields from Caterly's `Organization` row where the billing record is empty. Nothing is deleted; the old table stays until the new one is proven.

## 4. What changes for people

| Screen | Change |
|---|---|
| Account > Billing Details | becomes **Billing Profiles**: product list, then one form per product |
| Caterly > Business Profile | stays; shared fields now save to the product's billing profile; adds address line 2, country and state dropdowns |
| Caterly > Payments settings | GSTIN moves to the shared field; "Show GST on invoices" stays |
| Store checkout | loads the billing profile of the product being bought |
| Billing emails | go to that product's billing email (this already works per business and is switched to per product) |

## 5. Build order (each step shippable and tested alone)
1. Ops: per-product table, version column, audit rows, migration and tests.
2. Contract and Platform: product-aware read and save, version conflict handling.
3. Account: Billing Profiles list and per-product form, with the new billing-only fields.
4. Ops to product event, and the product's read copy.
5. Caterly Business Profile: save the shared fields through Ops, conflict message, new fields.
6. Store checkout and billing emails read the product's profile.

## 6. Decisions needed from AJ
1. **Home of the record:** Ops (recommended) or the Platform?
2. **Which fields are shared:** name, address lines, city, state, PIN, country and GSTIN, as in section 2? Business phone and email stay separate from billing phone and email?
3. **Brand name:** add a separate brand (trade) name, with the legal name used on invoices?
4. **New billing-only fields:** add GST registration type, PAN, billing CC email and customer reference, or fewer?
5. **Rivo and later products:** each product asks for its own profile the first time it is bought, starting empty, or may the Admin copy another product's profile with one button? (A copy is a one-time copy, never a link.)
6. **Who may edit in the product:** only the Business Admin, or anyone with the product's Settings permission (as Caterly's Business Profile allows today)?

## 7. AJ's decisions (2026-11-15 and 2026-11-16) — these override sections 2 and 6 where they differ
- Home: Ops. One record per business and product, with a `version`.
- **All fields are shared**, including description, website, Instagram and Facebook (and the logo, see the note below). Section 2's "product-only" column no longer applies. Order numbering and "show GST on invoices" are not billing fields and stay in Caterly.
- Fields: legal name, brand name, contact person, one email, one phone, address lines 1-2, city, state, PIN, country, GSTIN, description, website, Instagram, Facebook. No PAN, GST type, CC email or reference. No owner name.
- "Copy from another product" button; edit rights: the Admin, and the person with access in the product.
- Logo: decided 2026-11-16: the product keeps the file; Ops stores only a link (`logoUrl`). The product sends its link when it saves.
