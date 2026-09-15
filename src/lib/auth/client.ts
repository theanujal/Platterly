import { createAuthClient } from "better-auth/react";
import { organizationClient, inferAdditionalFields, emailOTPClient } from "better-auth/client/plugins";
import { ac, roles } from "./permissions";
// Type-only import — elided at compile time, no server code reaches the
// client bundle. Lets `authClient.signUp.email({ firstName, lastName })`
// type-check against the additionalFields declared in ./auth.ts.
import type { auth } from "./auth";

export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles }), inferAdditionalFields<typeof auth>(), emailOTPClient()],
});
