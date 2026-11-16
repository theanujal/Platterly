// The Platform uses plain CSS (no Tailwind). Without its own file, Turbopack (whose root is the repository root) finds the catering app's postcss.config.mjs, which needs
// @tailwindcss/postcss, and a Platform installed on its own (CI, deploy.sh platform) fails to build. An empty plugin list means "nothing to process".
const config = { plugins: {} };
export default config;
