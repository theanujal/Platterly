import { describe, expect, it } from "vitest";
import { renderTemplate, whatsappMessage } from "../templates";

/** Where each message's button points (step 3b.4): a payment goes to the Store, auto-pay settings to the Account, everything else stays in the product. */
const productUrl = "https://catering.example";
const base = { businessName: "Asha's Kitchen", ownerName: "Asha", productName: "Catering", productUrl };
const withLinks = { ...base, productKey: "catering", storeUrl: "https://store.example", accountUrl: "https://account.example" };
const v = { daysLeft: 3, endsOn: "29 Nov 2026", planName: "Pro", newPlanName: "Lite", amount: 3540, chargeOn: "1 Dec 2026", quantity: 2 };
const html = (key: string, c: object, extra: Record<string, string | number> = {}) => {
  const out = renderTemplate(key, { ...v, ...extra }, c as never);
  if (!out.ok) throw new Error(out.error);
  return out.value.html;
};

const STORE_PAY = "https://store.example/manage/caterly";
const ACCOUNT_METHODS = "https://account.example/payment-methods";

describe("messages about paying send the owner to the Store", () => {
  for (const key of ["trial_ending", "trial_ended", "plan_grace", "plan_renewal_due", "plan_locked", "payment_failed", "autopay_stopped", "downgrade_approval"]) {
    it(`${key} opens the Store's page for this product, under the Store's own product key`, () => {
      expect(html(key, withLinks)).toContain(`href="${STORE_PAY}"`);
      expect(html(key, withLinks)).not.toContain(`${productUrl}/subscribe`);
    });
  }
});

describe("messages about auto-pay send the owner to the Account's Payment method page", () => {
  for (const key of ["autopay_failed", "autopay_upcoming", "autopay_today", "autopay_paused", "autopay_resumed"]) {
    it(`${key} opens the Payment method page`, () => {
      expect(html(key, withLinks)).toContain(`href="${ACCOUNT_METHODS}"`);
      expect(html(key, withLinks)).not.toContain(`${productUrl}/settings/subscription`);
      expect(html(key, withLinks)).not.toContain(`${productUrl}/subscribe`);
    });
  }

  it("a paused plan's renewal and grace messages offer Resume in the Account, not a payment in the Store", () => {
    for (const key of ["plan_renewal_due", "plan_grace"]) {
      const page = html(key, withLinks, { paused: 1 });
      expect(page).toContain(`href="${ACCOUNT_METHODS}"`);
      expect(page).not.toContain(STORE_PAY);
    }
  });
});

describe("messages that are not about paying keep their link into the product", () => {
  it("welcome, order and subscription-change messages are unchanged", () => {
    expect(html("welcome_owner", withLinks)).toContain(`href="${productUrl}"`);
    expect(html("payment_received", withLinks)).toContain(`${productUrl}/settings/subscription`);
    expect(html("plan_changed", withLinks)).toContain(`${productUrl}/settings/subscription`);
    expect(html("stand_placed", withLinks)).toContain(`${productUrl}/settings/integration/public-menu-link`);
  });
});

describe("WhatsApp carries the same links", () => {
  it("the renewal, grace, locked and failed auto-pay messages use the Store or Account address", () => {
    expect(whatsappMessage("plan_renewal_due", v, withLinks)?.params).toContain(STORE_PAY);
    expect(whatsappMessage("plan_renewal_due", { ...v, paused: 1 }, withLinks)?.params).toContain(ACCOUNT_METHODS);
    expect(whatsappMessage("plan_grace", v, withLinks)?.params).toContain(STORE_PAY);
    expect(whatsappMessage("plan_grace", { ...v, paused: 1 }, withLinks)?.params).toContain(ACCOUNT_METHODS);
    expect(whatsappMessage("plan_locked", v, withLinks)?.params).toContain(STORE_PAY);
    expect(whatsappMessage("autopay_failed", v, withLinks)?.params).toContain(ACCOUNT_METHODS);
  });
});

describe("without the Store and Account addresses nothing changes", () => {
  it("every link is the product's own, as before", () => {
    expect(html("plan_renewal_due", base)).toContain(`href="${productUrl}/subscribe"`);
    expect(html("plan_renewal_due", base, { paused: 1 })).toContain(`href="${productUrl}/settings/subscription"`);
    expect(html("autopay_failed", base)).toContain(`href="${productUrl}/subscribe"`);
    expect(html("autopay_upcoming", base)).toContain(`href="${productUrl}/settings/subscription"`);
    expect(whatsappMessage("plan_locked", v, base)?.params).toContain(`${productUrl}/subscribe`);
  });

  it("a product with no Store key is linked by its own key, and a context with only one address uses that one", () => {
    expect(html("plan_locked", { ...withLinks, productKey: "rivo" })).toContain("https://store.example/manage/rivo");
    expect(html("plan_locked", { ...base, accountUrl: "https://account.example" })).toContain(`${productUrl}/subscribe`);
    expect(html("autopay_failed", { ...base, storeUrl: "https://store.example" })).toContain(`${productUrl}/subscribe`);
  });
});
