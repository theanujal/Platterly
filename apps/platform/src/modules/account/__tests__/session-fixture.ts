import type { Session } from "@/lib/session";

// TEST-ONLY injected session. It is a plain value handed straight to the data layer by automated tests. It is never read by the running
// application: `getSession()` returns null until F4, and runtime.guard.test.ts fails if any non-test file imports this one.
export const testSession = (userId: string, authenticatedAt = new Date()): Session => ({ userId, authenticatedAt });
