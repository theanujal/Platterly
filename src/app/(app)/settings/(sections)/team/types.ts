/**
 * Kept out of actions.ts — a "use server" file may only export async
 * functions; a plain const/interface export there breaks the entire
 * module's export processing at build time.
 */
export const TEAM_PRIVACY_KEY = "team.privacy";

export interface TeamPrivacySettings {
  allowTeamVisibility: boolean;
  showName: boolean;
  showEmail: boolean;
  showAvatar: boolean;
}

export const DEFAULT_TEAM_PRIVACY: TeamPrivacySettings = {
  allowTeamVisibility: true,
  showName: true,
  showEmail: false,
  showAvatar: true,
};
