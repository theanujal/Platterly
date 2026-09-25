import { describe, it, expect } from "vitest";
import { normalizePhone, formatPhoneDisplay, isValidPhone, whatsappDigits } from "@/lib/phone";

describe("phone helpers (all countries, E.164 storage)", () => {
  it("still normalizes Indian numbers in every legacy shape to +91XXXXXXXXXX", () => {
    expect(normalizePhone("9876543210")).toBe("+919876543210");
    expect(normalizePhone("098765 43210")).toBe("+919876543210");
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizePhone("+919876543210")).toBe("+919876543210");
  });

  it("keeps a non-Indian number's own country code instead of forcing +91", () => {
    expect(normalizePhone("+86 138 1234 5678")).toBe("+8613812345678");
    expect(normalizePhone("+1 302 414 8567")).toBe("+13024148567");
    expect(normalizePhone("+44 7400 123456")).toBe("+447400123456");
  });

  it("returns an unrecognizable value unchanged so validation elsewhere can reject it", () => {
    expect(normalizePhone("1")).toBe("1");
  });

  it("validates per country: 10 digits for India, 11 for China", () => {
    expect(isValidPhone("+919876543210")).toBe(true);
    expect(isValidPhone("+91987654321")).toBe(false); // 9 digits
    expect(isValidPhone("+8613812345678")).toBe(true);
    expect(isValidPhone("+861381234567")).toBe(false); // 10 digits — too short for a Chinese mobile
  });

  it("displays India as before and other countries in international format", () => {
    expect(formatPhoneDisplay("+919876543210")).toBe("+91 98765 43210");
    expect(formatPhoneDisplay("9876543210")).toBe("+91 98765 43210");
    expect(formatPhoneDisplay("+8613812345678")).toBe("+86 138 1234 5678");
    expect(formatPhoneDisplay(null)).toBe("—");
  });

  it("builds wa.me digits with the right country code", () => {
    expect(whatsappDigits("+8613812345678")).toBe("8613812345678");
    expect(whatsappDigits("9876543210")).toBe("919876543210");
  });
});
