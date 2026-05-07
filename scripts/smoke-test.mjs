#!/usr/bin/env node

import { dispatch } from "./newsman-mcp-server.mjs";

const checks = [];

await runCheck("initialize returns server info", async () => {
  const [response] = await runServer([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }
  ]);
  assert(response.result.serverInfo.name === "newsman-ai-sync", "Unexpected server name");
});

await runCheck("tools/list exposes tools", async () => {
  const [response] = await runServer([
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }
  ]);
  assert(response.result.tools.length >= 25, "Too few tools exposed");
});

await runCheck("tools/list exposes imports, segments, and automations", async () => {
  const [response] = await runServer([
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }
  ]);
  const toolNames = response.result.tools.map((tool) => tool.name);
  for (const expected of [
    "newsman_import_status",
    "newsman_import_csv",
    "newsman_import_schedule_jsonl",
    "newsman_segment_all",
    "newsman_segment_search",
    "newsman_segment_count",
    "newsman_automation_all",
    "newsman_automation_get_workflow",
    "newsman_automation_stats",
    "newsman_automation_set_workflow_status"
  ]) {
    assert(toolNames.includes(expected), `Missing tool ${expected}`);
  }
});

await runCheck("automation tool schemas match NewsMAN API contract", async () => {
  const [response] = await runServer([
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }
  ]);
  const tools = new Map(response.result.tools.map((tool) => [tool.name, tool]));
  assert(
    includesAll(tools.get("newsman_automation_all").inputSchema.required, ["list_id", "start_date", "stop_date"]),
    "automation.all required fields are wrong"
  );
  assert(
    includesAll(tools.get("newsman_automation_stats").inputSchema.required, ["list_id"]),
    "automation.stats required fields are wrong"
  );
  assert(
    tools.get("newsman_automation_stats").inputSchema.properties.workflow_ids,
    "automation.stats missing workflow_ids filter"
  );
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

await runCheck("live import requires explicit confirm", async () => {
  const [response] = await runServer([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "newsman_import_subscribers",
        arguments: {
          list_id: "123",
          dry_run: false,
          subscribers: [{ email: "test@example.com" }]
        }
      }
    }
  ]);
  assert(response.error.message.includes("confirm=true"), "Live import confirm guard did not trigger");
});

await runCheck("subscriber write requires explicit confirm", async () => {
  const [response] = await runServer([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "newsman_subscriber_save_subscribe",
        arguments: { list_id: "123", email: "test@example.com" }
      }
    }
  ]);
  assert(response.error.message.includes("confirm=true"), "Subscriber write confirm guard did not trigger");
});

await runCheck("generic write-style API calls require explicit confirm", async () => {
  const [response] = await runServer([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "newsman_api_call",
        arguments: { method: "newsletter.confirm", http_method: "POST", params: { newsletter_id: "999" } }
      }
    }
  ]);
  assert(response.error.message.includes("confirm=true"), "Generic API confirm guard did not trigger");
});

await runCheck("native CSV import dry-run does not require credentials", async () => {
  const [response] = await runServer([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "newsman_import_csv",
        arguments: {
          list_id: "123",
          segments: null,
          csv_data: "email,firstname\ntest@example.com,Test",
          dry_run: true
        }
      }
    }
  ]);
  const data = JSON.parse(response.result.content[0].text);
  assert(data.dry_run === true && data.csv_bytes > 0, "CSV import dry run response is wrong");
});

await runCheck("native CSV import requires explicit confirm when live", async () => {
  const [response] = await runServer([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "newsman_import_csv",
        arguments: {
          list_id: "123",
          segments: null,
          csv_data: "email,firstname\ntest@example.com,Test",
          dry_run: false
        }
      }
    }
  ]);
  assert(response.error.message.includes("confirm=true"), "CSV import confirm guard did not trigger");
});

await runCheck("native CSV import validates email header before credentials", async () => {
  const [response] = await runServer([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "newsman_import_csv",
        arguments: {
          list_id: "123",
          segments: null,
          csv_data: "firstname\nTest",
          dry_run: true
        }
      }
    }
  ]);
  assert(response.error.message.includes("email"), "CSV email header guard did not trigger");
});

await runCheck("JSONL import validates maximum line count before credentials", async () => {
  const jsonLines = Array.from({ length: 100001 }, (_, i) => `{"email":"u${i}@example.com"}`).join("\n");
  const [response] = await runServer([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "newsman_import_schedule_jsonl",
        arguments: {
          list_id: "123",
          segments: null,
          json_lines: jsonLines,
          delay: 0,
          dry_run: true
        }
      }
    }
  ]);
  assert(response.error.message.includes("100000"), "JSONL line-count guard did not trigger");
});

await runCheck("JSONL import validates email field before credentials", async () => {
  const [response] = await runServer([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "newsman_import_schedule_jsonl",
        arguments: {
          list_id: "123",
          segments: null,
          json_lines: "{\"firstname\":\"Test\"}",
          delay: 0,
          dry_run: true
        }
      }
    }
  ]);
  assert(response.error.message.includes("email"), "JSONL email field guard did not trigger");
});

await runCheck("segment refresh requires explicit confirm", async () => {
  const [response] = await runServer([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "newsman_segment_refresh", arguments: { segment_id: "555" } }
    }
  ]);
  assert(response.error.message.includes("confirm=true"), "Segment refresh confirm guard did not trigger");
});

await runCheck("automation status change requires explicit confirm", async () => {
  const [response] = await runServer([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "newsman_automation_set_workflow_status",
        arguments: { workflow_id: "777", status: "paused" }
      }
    }
  ]);
  assert(response.error.message.includes("confirm=true"), "Automation status confirm guard did not trigger");
});

await runCheck("newsletter draft creation requires explicit confirm", async () => {
  const [response] = await runServer([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "newsman_newsletter_create",
        arguments: { list_id: "123", subject: "Draft" }
      }
    }
  ]);
  assert(response.error.message.includes("confirm=true"), "Newsletter create confirm guard did not trigger");
});

await runCheck("invalid subscriber email is rejected before import", async () => {
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
          subscribers: [{ email: "not-an-email" }]
        }
      }
    }
  ]);
  assert(response.error.message.includes("valid email"), "Invalid email was not rejected");
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
  const previousUserId = process.env.NEWSMAN_USER_ID;
  const previousApiKey = process.env.NEWSMAN_API_KEY;
  process.env.NEWSMAN_USER_ID = "";
  process.env.NEWSMAN_API_KEY = "";

  try {
    const responses = [];
    for (const message of messages) {
      if (message.id === undefined) {
        continue;
      }
      try {
        const result = await dispatch(message.method, message.params ?? {});
        responses.push({ jsonrpc: "2.0", id: message.id, result });
      } catch (error) {
        responses.push({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: error.code ?? -32603, message: error.message }
        });
      }
    }
    return responses;
  } finally {
    restoreEnv("NEWSMAN_USER_ID", previousUserId);
    restoreEnv("NEWSMAN_API_KEY", previousApiKey);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includesAll(values, expectedValues) {
  return expectedValues.every((value) => values.includes(value));
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
