import "dotenv/config";

// The ops link (docs/ops-contract.md) must never reach a real ops server from a test run, even when .env has it switched
// on for development. The ops-link tests set these themselves.
for (const key of ["OPS_BASE_URL", "OPS_EVENT_SECRET", "OPS_COMMAND_SECRETS", "OPS_PRODUCT_KEY", "OPS_BILLING"]) delete process.env[key];

// Same for the real ZeptoMail token: a test run must never send real email (issue 89). The email tests stub their own.
delete process.env.ZEPTOMAIL_TOKEN;
delete process.env.ZEPTOMAIL_FROM;
// And a test run never points at the real mail API either: the mail guard (packages/contract/src/mail-guard.ts) skips real sends to anyone but AJ, so a test that
// relied on a developer's .env pointing at the local mail sink failed on a machine without one (CI). Every run now targets the sink address; the mail guard test
// sets its own URLs, and fetch is stubbed in every send test.
process.env.ZEPTOMAIL_API_URL = "http://127.0.0.1:3600/v1.1/email";
