// The local app roster (docs/platform-foundation-plan.md, decision D14). One place for ports and health addresses.
export const APPS = [
  { name: "catering", port: 3000, cwd: ".", dev: ["npm", "run", "dev"], health: "http://localhost:3000/api/health" },
  { name: "site", port: 3100, cwd: "apps/site", dev: ["npm", "run", "dev"], health: "http://localhost:3100/" },
  { name: "ops", port: 3200, cwd: "apps/ops", dev: ["npm", "run", "dev"], health: "http://localhost:3200/api/health" },
  { name: "platform", port: 3300, cwd: "apps/platform", dev: ["npm", "run", "dev"], health: "http://localhost:3300/api/health" },
  // The stub product (port 3500) is added by the phase that builds it.
];
export const MAIL_SINK = { name: "mail-sink", port: 3600, health: "http://localhost:3600/api/health" };
