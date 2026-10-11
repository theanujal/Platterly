import "dotenv/config";

// The real ZeptoMail token lives in .env for the running app; tests must never send a real email, so it is cleared here
// (a test that needs the transport injects its own fetch).
delete process.env.ZEPTOMAIL_TOKEN;
delete process.env.ZEPTOMAIL_FROM;
