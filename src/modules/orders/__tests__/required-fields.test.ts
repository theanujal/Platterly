import { describe, it, expect } from "vitest";
import { orderBlockingField, orderMissingFields, orderMissingMessage } from "../required-fields";

describe("what an order can't go without (AJ, 2026-10-18)", () => {
  const full = { eventTypeId: "et", eventStartDate: "2026-12-05", eventEndDate: "2026-12-05", venue: "Taj Hall", adultCount: 80 };

  it("needs an event type, an event date, a venue location and at least one adult", () => {
    expect(orderMissingFields(full)).toEqual([]);
    expect(orderMissingFields({})).toEqual(["Event Type", "Event Date", "Venue / Building Name", "Adults"]);
    expect(orderMissingFields({ ...full, venue: "  " })).toEqual(["Venue / Building Name"]);
    expect(orderMissingFields({ ...full, adultCount: 0 })).toEqual(["Adults"]);
    expect(orderMissingFields({ ...full, adultCount: "12" })).toEqual([]);
  });

  it("a new order is stopped by the first missing field, in the order the form asks for them", () => {
    expect(orderBlockingField({ ...full, eventTypeId: null, venue: "" })).toBe("Event Type");
    expect(orderBlockingField({ ...full, venue: "" })).toBe("Venue / Building Name");
    expect(orderBlockingField(full)).toBeNull();
  });

  it("a saved order can't clear a field it had, but is not locked out for one it never had", () => {
    // Had everything: clearing the venue or the guests is refused.
    expect(orderBlockingField({ ...full, venue: "" }, full)).toBe("Venue / Building Name");
    expect(orderBlockingField({ ...full, adultCount: 0 }, full)).toBe("Adults");
    // An older order with no venue can still be saved (its card says what it needs), but not lose its guests meanwhile.
    const older = { ...full, venue: null };
    expect(orderBlockingField({ ...older, venue: "" }, older)).toBeNull();
    expect(orderBlockingField({ ...older, venue: "", adultCount: 0 }, older)).toBe("Adults");
  });

  it("words each message the way the form does", () => {
    expect(orderMissingMessage("Event Type")).toBe("Event Type is required.");
    expect(orderMissingMessage("Adults")).toBe("Adults: enter at least 1 guest.");
  });
});
