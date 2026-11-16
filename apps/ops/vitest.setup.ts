import "dotenv/config";

// The real ZeptoMail token lives in .env for the running app; tests must never send a real email, so it is cleared here
// (a test that needs the transport injects its own fetch).
delete process.env.ZEPTOMAIL_TOKEN;
delete process.env.ZEPTOMAIL_FROM;

// And never the real mail API: the mail guard (packages/contract/src/mail-guard.ts) skips real sends to anyone but AJ, so a test that relied on a developer's .env
// pointing at the local mail sink failed on a machine without one (CI). Every run targets the sink address; the tests that send inject their own fetch.
process.env.ZEPTOMAIL_API_URL = "http://127.0.0.1:3600/v1.1/email";
