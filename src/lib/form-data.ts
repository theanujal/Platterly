import { userMessage } from "@/lib/errors";

/** A failed server action's result, with a message safe to show (internal errors become a plain sentence). */
export function toErrorResult(error: unknown): { ok: false; error: string } {
  return { ok: false, error: userMessage(error, "Something went wrong.") };
}

/** A trimmed text field, or undefined when it is missing or blank. */
export function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** A number field, or undefined when it is missing, blank or not a number. */
export function numberField(formData: FormData, name: string): number | undefined {
  const raw = stringField(formData, name);
  if (raw === undefined) return undefined;
  const parsed = Number.parseFloat(raw);
  return Number.isNaN(parsed) ? undefined : parsed;
}
