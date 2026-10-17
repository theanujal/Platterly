import { describe, it, expect } from "vitest";
import { quotationMissingField, quotationMissingMessage } from "../required-fields";

describe("what a quotation can't go without", () => {
  const full = { eventTypeId: "et", eventStartDate: new Date("2026-12-05"), eventEndDate: new Date("2026-12-05"), venue: "Grand Hall", adultCount: 50 };

  it("is complete with an event type, an event date, a venue location and at least one adult", () => {
    expect(quotationMissingField(full)).toBeNull();
    expect(quotationMissingField({ ...full, adultCount: "50" })).toBeNull();
  });

  it("names the first thing missing, in the order the form asks for it", () => {
    expect(quotationMissingField({})).toBe("Event Type");
    expect(quotationMissingField({ ...full, eventTypeId: null })).toBe("Event Type");
    expect(quotationMissingField({ ...full, eventStartDate: null })).toBe("Event Date");
    expect(quotationMissingField({ ...full, eventEndDate: undefined })).toBe("Event Date");
    expect(quotationMissingField({ ...full, venue: "   " })).toBe("Venue Location");
    expect(quotationMissingField({ ...full, adultCount: 0 })).toBe("Adults");
    expect(quotationMissingField({ ...full, adultCount: "" })).toBe("Adults");
    expect(quotationMissingField({ ...full, adultCount: null })).toBe("Adults");
  });

  it("words each message the way the form does", () => {
    expect(quotationMissingMessage("Event Type")).toBe("Event Type is required.");
    expect(quotationMissingMessage("Adults")).toBe("Adults: enter at least 1 guest.");
  });
});
