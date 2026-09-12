// Vitest runs plain Node, not Next.js's RSC bundler, so the real
// `server-only` package (which throws unconditionally) would break every
// test that imports server-side code. Aliased in vitest.config.ts — this
// only affects test runs, not the real Next.js build's client/server guard.
export {};
