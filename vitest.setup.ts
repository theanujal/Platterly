import "dotenv/config";

// The ops link (docs/ops-contract.md) must never reach a real ops server from a test run, even when .env has it switched
// on for development. The ops-link tests set these themselves.
for (const key of ["OPS_BASE_URL", "OPS_EVENT_SECRET", "OPS_COMMAND_SECRETS", "OPS_PRODUCT_KEY", "OPS_BILLING"]) delete process.env[key];
