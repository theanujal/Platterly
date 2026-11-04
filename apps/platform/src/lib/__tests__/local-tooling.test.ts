import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APPS, MAIL_SINK } from "../../../../../scripts/local/apps.mjs";
import { smoke } from "../../../../../scripts/local/smoke.mjs";

const dir = mkdtempSync(join(tmpdir(), "mail-sink-"));
process.env.MAIL_SINK_DIR = dir;
const port = 36999;
let server: import("node:http").Server;

beforeAll(async () => {
  const { startMailSink } = await import("../../../../../scripts/local/mail-sink.mjs");
  server = await startMailSink(port);
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("local tooling", () => {
  it("lists the approved ports: Caterly 3000, Site 3100, Ops 3200, Platform 3300", () => {
    expect(APPS.map((a: { name: string; port: number }) => [a.name, a.port])).toEqual([["catering", 3000], ["site", 3100], ["ops", 3200], ["platform", 3300]]);
    expect(MAIL_SINK.port).toBe(3600);
  });

  it("the mail sink accepts a ZeptoMail-shaped message, keeps it, lists it and sends nothing out", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1.1/email`, {
      method: "POST",
      headers: { authorization: "Zoho-enczapikey local-sink", "content-type": "application/json" },
      body: JSON.stringify({ from: { address: "noreply@platterly.localhost" }, to: [{ email_address: { address: "owner@example.com" } }], subject: "Your code", htmlbody: "<p>123456</p>" }),
    });
    expect(res.status).toBe(200);
    const { request_id } = await res.json();
    expect(request_id).toMatch(/^sink_/);
    expect(readdirSync(dir)).toHaveLength(1);
    const saved = JSON.parse(readFileSync(join(dir, readdirSync(dir)[0]), "utf8"));
    expect(saved).toMatchObject({ to: ["owner@example.com"], subject: "Your code", html: "<p>123456</p>" });
    const listed = await (await fetch(`http://127.0.0.1:${port}/api/messages`)).json();
    expect(listed).toHaveLength(1);
    expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toContain("Your code");
    expect((await fetch(`http://127.0.0.1:${port}/v1.1/email`, { method: "POST", body: "{nope" })).status).toBe(400);
  });

  it("smoke reports an app that is up and one that is down", async () => {
    const results = await smoke([{ name: "sink", port, health: `http://127.0.0.1:${port}/api/health` }, { name: "nothing", port: 1, health: "http://127.0.0.1:1/" }]);
    expect(results.map((r: { name: string; ok: boolean }) => [r.name, r.ok])).toEqual([["sink", true], ["nothing", false]]);
  });
});
