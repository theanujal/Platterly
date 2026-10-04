import { describe, it, expect } from "vitest";
import { formatInvoiceNumber, invoiceInitials } from "@/modules/subscriptions/invoice-number";
import { gstKind, gstLines, gstStateCode } from "@/modules/subscriptions/gst-split";

describe("plan invoice numbers (AJ's format)", () => {
  it("ABC Caterer's first invoice in October 2026 is FPAC-26-10-1", () => {
    expect(formatInvoiceNumber("FP", "ABC Caterer", new Date("2026-10-15T06:00:00Z"), 1)).toBe("FPAC-26-10-1");
  });
  it("takes the first letter of each word, ignores punctuation, caps at four, and never comes out empty", () => {
    expect(invoiceInitials("Spice & Co. Food Works Pvt")).toBe("SCFW");
    expect(invoiceInitials("annapurna")).toBe("A");
    expect(invoiceInitials("  ---  ")).toBe("X");
  });
  it("uses the Indian month: a payment just after midnight IST on 1 November is November", () => {
    expect(formatInvoiceNumber("FP", "Zed Kitchen", new Date("2026-10-31T19:00:00Z"), 7)).toBe("FPZK-26-11-7");
  });
});

describe("GST split on a plan invoice", () => {
  it("same state is CGST + SGST (half each), another state is IGST, unknown shows one GST line", () => {
    expect(gstKind({ stateCode: "29" }, { gstin: "29ABCDE1234F1Z5" })).toBe("INTRA");
    expect(gstKind({ stateCode: "29" }, { gstin: "27ABCDE1234F1Z5" })).toBe("INTER");
    expect(gstKind({ state: "Karnataka" }, { state: " karnataka " })).toBe("INTRA");
    expect(gstKind({ state: "Karnataka" }, { state: "Delhi" })).toBe("INTER");
    expect(gstKind({}, { state: "Delhi" })).toBe("UNKNOWN");
    expect(gstKind({ stateCode: "29" }, {})).toBe("UNKNOWN");
    expect(gstStateCode("not a gstin")).toBeNull();

    expect(gstLines("INTRA", 18, 540)).toEqual([{ label: "CGST (9%)", amount: 270 }, { label: "SGST (9%)", amount: 270 }]);
    expect(gstLines("INTER", 18, 540)).toEqual([{ label: "IGST (18%)", amount: 540 }]);
    expect(gstLines("UNKNOWN", 18, 540)).toEqual([{ label: "GST (18%)", amount: 540 }]);
    // An odd paisa is never lost: the two halves always add back up.
    const [cgst, sgst] = gstLines("INTRA", 18, 0.05);
    expect(Math.round((cgst.amount + sgst.amount) * 100)).toBe(5);
  });
});
