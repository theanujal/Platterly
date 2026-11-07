// The per-person limit on wrong "current password" guesses, shared by every Account action that asks for the current password (change password,
// download my data, request deletion), so alternating between them does not multiply the guesses. In memory: a restart clears it, which only ever
// gives a person a fresh set of attempts.
export const ATTEMPT_WINDOW_MS = 15 * 60_000;
export const ATTEMPT_MAX_WRONG = 5;
const wrong = new Map<string, number[]>();

export const recentWrong = (userId: string, now: number): number[] => (wrong.get(userId) ?? []).filter((t) => now - t < ATTEMPT_WINDOW_MS);
export const isLockedOut = (userId: string, now: number): boolean => recentWrong(userId, now).length >= ATTEMPT_MAX_WRONG;
export const noteWrong = (userId: string, now: number): void => void wrong.set(userId, [...recentWrong(userId, now), now]);
export const noteRight = (userId: string): void => void wrong.delete(userId);
export const resetPasswordAttempts = (): void => wrong.clear();
