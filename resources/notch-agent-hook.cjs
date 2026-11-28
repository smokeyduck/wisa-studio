"use strict";
// Local command hook. Never executes input; offline/timeout means no permission override.
const fs = require("node:fs");
const http = require("node:http");
const { randomUUID } = require("node:crypto");
const AGENTS = new Set(["claude", "codex", "cursor", "gemini", "copilot", "opencode", "custom"]);
const MAX = 262144;

async function forward(configPath, agent, event, payload) {
  if (!AGENTS.has(agent) || typeof event !== "string" || !payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535 || !/^[a-f0-9]{64}$/.test(config.token)) return {};
  if (agent === "claude" || agent === "codex") payload = { ...payload, request_id: randomUUID() };
  const body = JSON.stringify({ agent, event, payload });
  if (Buffer.byteLength(body) > MAX) return {};
  return new Promise((resolve) => {
    const request = http.request({ host: "127.0.0.1", port: config.port, path: "/events", method: "POST", headers: {
      Authorization: `Bearer ${config.token}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body),
    } }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; if (text.length > 8192) request.destroy(); });
      response.on("end", () => { try { resolve(response.statusCode === 200 ? JSON.parse(text) : {}); } catch { resolve({}); } });
      response.on("error", () => resolve({}));
    });
    request.setTimeout(95000, () => request.destroy());
    request.on("error", () => resolve({}));
    const abort = () => request.destroy();
    process.once("SIGTERM", abort);
    process.once("SIGINT", abort);
    request.once("close", () => { process.off("SIGTERM", abort); process.off("SIGINT", abort); });
    request.end(body);
  });
}

async function main() {
  const [configPath, agent, event] = process.argv.slice(2);
  if (!configPath || !AGENTS.has(agent) || !event) return;
  let text = "";
  const deadline = setTimeout(() => process.exit(0), 98000);
  try {
    for await (const chunk of process.stdin) {
      text += chunk.toString();
      if (Buffer.byteLength(text) > MAX) return;
    }
    const reply = await forward(configPath, agent, event, JSON.parse(text));
    if (reply && Object.keys(reply).length) process.stdout.write(`${JSON.stringify(reply)}\n`);
  } catch { /* A hook failure must leave the agent's own permission prompt in charge. */ }
  finally { clearTimeout(deadline); }
}
module.exports = { forward };
if (require.main === module) void main();
