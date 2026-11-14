import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

/** The proxy sends a request with no session cookie to /sign-in, except for the routes that answer for themselves. */
function through(path: string) {
  const res = proxy(new NextRequest(`http://ops.localhost:3200${path}`));
  const passed = res.headers.get("x-middleware-next") === "1";
  return { passed, status: res.status, location: res.headers.get("location") };
}

describe("ops proxy: public routes", () => {
  it("lets exactly /api/platform/products through without a session", () => {
    expect(through("/api/platform/products")).toMatchObject({ passed: true });
  });

  it("lets exactly the two signed account-review calls through without a session", () => {
    for (const path of ["/api/platform/account-reviews", "/api/platform/account-reviews/status"]) expect(through(path).passed, path).toBe(true);
    for (const path of ["/api/platform/account-reviews/", "/api/platform/account-reviews/other", "/api/platform/account-reviews/status/x"]) expect(through(path).passed, path).toBe(false);
  });
  it("sends every other route under /api/platform to sign-in, however it is written", () => {
    for (const path of ["/api/platform", "/api/platform/", "/api/platform/other", "/api/platform/products/", "/api/platform/products/x", "/api/platform/products-extra", "/api/platformx", "/api/platform/../x"]) {
      const result = through(path);
      expect(result.passed, path).toBe(false);
      expect(result.location, path).toMatch(/\/sign-in$/);
    }
  });

  it("lets the Store's payment-method calls through for one business and product, and nothing near them", () => {
    const biz = `biz_${"a".repeat(32)}`;
    for (const action of ["methods", "method-add", "method-add-verify", "method-primary", "method-primary-verify", "method-remove", "autopay-pause", "autopay-resume", "autopay-cancel", "owner-contact", "register-pending", "abandon-pending"]) expect(through(`/api/platform/businesses/${biz}/products/catering/billing/${action}`).passed, action).toBe(true);
    for (const path of [`/api/platform/businesses/${biz}/products/catering/billing/methods/x`, `/api/platform/businesses/${biz}/products/catering/billing/method`, `/api/platform/businesses/${biz}/products/catering/billing/method-add/`, `/api/platform/businesses/biz_short/products/catering/billing/methods`, `/api/platform/businesses/${biz}/products/catering/billing/method-other`, `/api/platform/businesses/${biz}/products/catering/billing/autopay`, `/api/platform/businesses/${biz}/products/catering/billing/autopay-stop`, `/api/platform/businesses/${biz}/products/catering/billing/autopay-pause/x`]) {
      expect(through(path).passed, path).toBe(false);
    }
  });

  it("lets exactly the Store's checkout and verify calls through for one business and product, and nothing else near them", () => {
    const biz = `biz_${"a".repeat(32)}`;
    for (const action of ["checkout", "verify"]) expect(through(`/api/platform/businesses/${biz}/products/catering/billing/${action}`).passed, action).toBe(true);
    for (const path of [`/api/platform/businesses/${biz}/products/catering/billing`, `/api/platform/businesses/${biz}/products/catering/billing/checkout/x`, `/api/platform/businesses/${biz}/products/catering/billing/other`, `/api/platform/businesses/biz_short/products/catering/billing/checkout`, `/api/platform/businesses/${biz}/products/Catering/billing/checkout`, `/api/platform/businesses/${biz}/products/catering/billing/checkout/`]) {
      expect(through(path).passed, path).toBe(false);
    }
  });

  it("lets exactly the invoice read for one business, product and payment through, and nothing near it", () => {
    const biz = `biz_${"a".repeat(32)}`;
    expect(through(`/api/platform/businesses/${biz}/products/catering/billing/payments/pay_abc123/invoice`).passed).toBe(true);
    for (const path of [`/api/platform/businesses/${biz}/products/catering/billing/payments/pay_abc123`, `/api/platform/businesses/${biz}/products/catering/billing/payments/pay_abc123/invoice/x`, `/api/platform/businesses/${biz}/products/catering/billing/payments//invoice`, `/api/platform/businesses/biz_x/products/catering/billing/payments/pay_abc123/invoice`, `/api/platform/businesses/${biz}/products/catering/billing/payments/pa y/invoice`]) {
      expect(through(path).passed, path).toBe(false);
    }
  });

  it("lets exactly the billing-details read and save for one business through, and nothing near it", () => {
    const biz = `biz_${"a".repeat(32)}`;
    expect(through(`/api/platform/businesses/${biz}/billing-profile`).passed).toBe(true);
    for (const path of [`/api/platform/businesses/${biz}/billing-profile/`, `/api/platform/businesses/${biz}/billing-profile/x`, `/api/platform/businesses/${biz}/billing-profiles`, `/api/platform/businesses/biz_short/billing-profile`, `/api/platform/businesses/${biz}/products/catering/billing-profile`, `/api/platform/businesses/billing-profile`]) {
      expect(through(path).passed, path).toBe(false);
    }
  });

  it("keeps the other public prefixes working", () => {
    for (const path of ["/sign-in", "/api/auth/get-session", "/api/health", "/api/products/events", "/api/webhooks/razorpay", "/api/cron", "/api/site/x", "/api/public/enquiries"]) {
      expect(through(path).passed, path).toBe(true);
    }
  });

  it("still sends a private page to sign-in without a session, and lets it through with one", () => {
    expect(through("/settings/products")).toMatchObject({ passed: false });
    const withSession = proxy(new NextRequest("http://ops.localhost:3200/settings/products", { headers: { cookie: "ops.session_token=abc" } }));
    expect(withSession.headers.get("x-middleware-next")).toBe("1");
  });
});
