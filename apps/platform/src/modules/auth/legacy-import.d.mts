import type { Pool } from "pg";
export interface LegacyImportReport {
  sourceUsers: number;
  sourceCredentialAccounts: number;
  usersAdded: number;
  usersAlreadyPresent: number;
  emailConflicts: number;
  skippedNoEmail: number;
  credentialAccountsAdded: number;
  addedUnverified: number;
  addedWithoutPassword: number;
  addedUserIds: string[];
  conflictUserIds: string[];
  applied: boolean;
}
export declare function importCaterlyUsers(input: { source: Pool; target: Pool; apply?: boolean }): Promise<LegacyImportReport>;
