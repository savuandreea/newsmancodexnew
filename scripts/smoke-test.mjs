#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "newsman-mcp-server.mjs");

const checks = [];

await runCheck("initialize returns server info", async () => {
  const [response] = await runServer([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }
  ]);
  assert(response.result.serverInfo.name === "newsman", "Unexpected server name");
});

await runCheck("tools/list exposes tools", async () => {
  const [response] = await runServer([
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }
  ]);
  assert(response.result.tools.length >= 10, "Too few tools exposed");
});

await runCheck("dry-run import does not require credentials", async () => {
  const [response] = await runServer([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "newsman_import_subscribers",
        arguments: {
          list_id: "123",
          dry_run: true,
          subscribers: [{ email: "test@example.com" }]
        }
      }
    }
  ]);
  const data = JSON.parse(response.result.content[0].text);
  assert(data.dry_run === true && data.count === 1, "Dry run response is wrong");
});

await runCheck("missing credentials error is clear", async () => {
  const [response] = await runServer([
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "newsman_list_all", arguments: {} } }
  ]);
  assert(response.error.message.includes("NEWSMAN_USER_ID"), "Missing credentials message is unclear");
});

await runCheck("send confirm guard blocks accidental send", async () => {
  const [response] = await runServer([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "newsman_newsletter_confirm", arguments: { newsletter_id: "999", confirm: false } }
    }
  ]);
  assert(response.error.message.includes("confirm=true"), "Confirm guard did not trigger");
});

await runCheck("import batch size guard blocks oversized imports", async () => {
  const subscribers = Array.from({ length: 501 }, (_, i) => ({ email: `u${i}@example.com` }));
  const [response] = await runServer([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "newsman_import_subscribers", arguments: { list_id: "123", dry_run: false, subscribers } }
    }
  ]);
  assert(response.error.message.includes("up to 500"), "Batch size guard did not trigger");
});

for (const check of checks) {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.name}`);
  if (!check.ok) {
    console.error(check.error);
    process.exitCode = 1;
  }
}

async function runCheck(name, fn) {
  try {
    await fn();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, error: error.stack || error.message });
  }
}

async function runServer(messages) {
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, NEWSMAN_USER_ID: "", NEWSMAN_API_KEY: "" },
    stdio: ["pipe", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  for (const message of messages) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }
  child.stdin.end();

  const [code] = await once(child, "close");
  if (code !== 0) {
    throw new Error(`Server exited with ${code}: ${stderr}`);
  }

  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
