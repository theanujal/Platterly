-- data-safe-approved: every billing_customer row was copied into product_billing_profile by migration 20261116120000 and the product profile has been the only record read or written since; nothing reads this table any more.
DROP TABLE "billing_customer";
