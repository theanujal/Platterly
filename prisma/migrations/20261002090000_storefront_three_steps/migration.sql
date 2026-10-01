-- The public order wizard went from 6 steps to 3 (Event Details, Build Your Menu, Review & Submit).
-- `currentStep` is the furthest step a draft has unlocked. Old steps 2-4 (menu, items, add-ons) are now
-- the one Build Your Menu step; old steps 5-6 (venue, review) unlocked the Review step.
UPDATE "storefront_draft"
SET "currentStep" = CASE
  WHEN "currentStep" >= 5 THEN 3
  WHEN "currentStep" >= 2 THEN 2
  ELSE "currentStep"
END;
