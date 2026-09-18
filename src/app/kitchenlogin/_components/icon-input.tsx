// Chunk 4 — originally defined both of these locally as thin wrappers
// adding a left glyph to the auth forms' inputs, matching the icon-in-field
// style captured from MenuMate's auth pages. Both promoted to
// components/ui/ (AJ, 2026-09-19) so other forms across the app can reuse
// them too — re-exported here so every existing `from "./icon-input"`
// import in this folder keeps working.
export { IconInput } from "@/components/ui/icon-input";
export { PasswordInput } from "@/components/ui/password-input";
