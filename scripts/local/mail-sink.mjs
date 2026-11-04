// Local mail sink. Speaks just enough of ZeptoMail's REST API (POST /v1.1/email) that catering and Ops can send to it,
// keeps every message as a JSON file in .data/mail-sink/ and lists them at http://localhost:3600/. Nothing leaves the machine.
import { createServer } from "node:http";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

export const SINK_PORT = Number(process.env.MAIL_SINK_PORT ?? 3600);
const dir = process.env.MAIL_SINK_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".data", "mail-sink");
mkdirSync(dir, { recursive: true });

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const messages = () => readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse().map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));

export function startMailSink(port = SINK_PORT) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "POST" && url.pathname === "/v1.1/email") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const id = `sink_${Date.now()}_${randomBytes(4).toString("hex")}`;
          const to = (body.to ?? []).map((t) => t.email_address?.address).filter(Boolean);
          writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, receivedAt: new Date().toISOString(), from: body.from?.address, to, subject: body.subject, html: body.htmlbody }, null, 2));
          res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ request_id: id, message: "OK" }));
        } catch {
          res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "Bad JSON" } }));
        }
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/health") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ status: "ok", app: "mail-sink" }));
    if (req.method === "GET" && url.pathname === "/api/messages") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(messages()));
    if (req.method === "GET" && url.pathname === "/") {
      const rows = messages().map((m) => `<details><summary>${escape(m.receivedAt)} to ${escape((m.to ?? []).join(", "))}: ${escape(m.subject)}</summary><iframe sandbox style="width:100%;height:420px;border:1px solid #ccc" srcdoc="${escape(m.html ?? "")}"></iframe></details>`).join("");
      return void res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(`<!doctype html><title>Mail sink</title><body style="font-family:sans-serif;max-width:900px;margin:2rem auto"><h1>Mail sink</h1><p>${messages().length} message(s). Local only.</p>${rows}`);
    }
    res.writeHead(404).end("Not found");
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await startMailSink();
  console.log(`[mail-sink] listening on http://localhost:${SINK_PORT}  (messages in ${dir})`);
}
