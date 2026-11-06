import type { Pool } from "pg";
import { accountOrigin, accountRedirectUri } from "./config";
import { registerAccountClient as register } from "./identity-migrate.mjs";

/** Registers (or refreshes) the first-party Account client for this environment's own origins. See identity-migrate.mjs. */
export const registerAccountClient = (pool: Pool, redirectUri: string = accountRedirectUri(), origin: string = accountOrigin()) => register(pool, redirectUri, origin);
