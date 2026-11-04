import { describe, expect, it } from "vitest";
import { newId } from "@platterly/contract";
import { PLATFORM_CONTRACT_VERSION, parsePlatformEvent, signPlatformRequest, verifyPlatformRequest } from "@platterly/platform-contract";

describe("Platform can use the shared contract packages", () => {
  it("signs and verifies an event, then parses it", () => {
    const body = JSON.stringify({ version: PLATFORM_CONTRACT_VERSION, eventId: newId("event"), businessId: newId("business"), sequence: 1, occurredAt: new Date().toISOString(), type: "organisation.status", data: { status: "active" } });
    const url = "https://catering.platterly.in/api/platform/events";
    const headers = signPlatformRequest("platsec_x", newId("event"), body, "POST", url);
    expect(verifyPlatformRequest(["platsec_x"], headers, body, "POST", url).ok).toBe(true);
    expect(parsePlatformEvent(JSON.parse(body)).ok).toBe(true);
  });
});
