import type { Pool } from "pg";
export declare const ACCOUNT_CLIENT_ID: string;
export declare const ACCOUNT_SCOPES: string[];
export declare function migrateIdentity(pool: Pool, dir: string): Promise<{ name: string; checksum: string }[]>;
export declare function registerAccountClient(pool: Pool, redirectUri: string, origin: string): Promise<void>;
