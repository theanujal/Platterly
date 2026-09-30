-- The storefront wizard gained a step between "Choose Items" (3) and "Venue & Delivery": step 4 is now
-- "Add-ons & Live Counters", so Venue is 5 and Review is 6. Shift drafts that had already reached the old step 4 or
-- beyond so they keep pointing at the same screen.
UPDATE "storefront_draft" SET "currentStep" = "currentStep" + 1 WHERE "currentStep" >= 4;
