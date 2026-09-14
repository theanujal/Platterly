// Chunk 5 Group 5.4 — the actual custom-slug logic now lives at
// src/app/settings/(sections)/integration/public-menu-link/actions.ts (its
// real, persistent home in the Settings IA). Re-exported here so the
// Dashboard's existing nudge dialog (`custom-link-dialog.tsx`, imports from
// "../actions") keeps working unchanged.
export { setCustomSlugAction, checkSlugAvailableAction } from "../settings/(sections)/integration/public-menu-link/actions";
