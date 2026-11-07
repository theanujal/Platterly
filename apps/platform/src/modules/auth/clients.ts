import type { Pool } from "pg";
import { accountOrigin, accountRedirectUri, storeOrigin, storeRedirectUri } from "./config";
import { registerAccountClient as register, registerStoreClient as registerStore } from "./identity-migrate.mjs";

/** Registers (or refreshes) the first-party Account client for this environment's own origins. See identity-migrate.mjs. */
export const registerAccountClient = (pool: Pool, redirectUri: string = accountRedirectUri(), origin: string = accountOrigin()) => register(pool, redirectUri, origin);

/** Registers (or refreshes) the first-party Store client for this environment's own origins. */
export const registerStoreClient = (pool: Pool, redirectUri: string = storeRedirectUri(), origin: string = storeOrigin()) => registerStore(pool, redirectUri, origin);
