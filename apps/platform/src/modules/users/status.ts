// users.status (F3.1.1). Stored only: nothing here enforces it.
// `disabled` is a global Platform-level block. It changes no memberships, roles, ownership or product slots. Refusing a disabled
// user at sign-in and staff-only audited reactivation are later work (F3.1.2, F4).
export const USER_STATUSES = ["active", "disabled"] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

export function isUserStatus(value: unknown): value is UserStatus {
  return typeof value === "string" && (USER_STATUSES as readonly string[]).includes(value);
}
