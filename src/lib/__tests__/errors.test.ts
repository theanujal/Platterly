import { describe, it, expect, vi } from "vitest";
import { userMessage, ValidationError } from "@/lib/errors";

describe("userMessage", () => {
  it("shows our own readable messages", () => {
    expect(userMessage(new ValidationError("Enter a name."))).toBe("Enter a name.");
    expect(userMessage(new Error("That is more than the balance of ₹400."))).toBe("That is more than the balance of ₹400.");
  });

  it("hides database and code internals, and logs them instead", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const prismaLike = new Error("\nInvalid `prisma.expense.create()` invocation in\n/Users/x/app/src/modules/expenses/expense.ts:39:36\n\n  Unique constraint failed");
    expect(userMessage(prismaLike, "Could not save.")).toBe("Could not save.");
    const named = Object.assign(new Error("boom"), { name: "PrismaClientKnownRequestError" });
    expect(userMessage(named)).toBe("Something went wrong. Please try again.");
    expect(userMessage(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBe("Something went wrong. Please try again.");
    expect(userMessage("a string thrown")).toBe("Something went wrong. Please try again.");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
