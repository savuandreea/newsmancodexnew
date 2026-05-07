#!/usr/bin/env node

import { createBridgeServer } from "./server.mjs";

const port = 9876;
const baseUrl = `http://127.0.0.1:${port}`;
const previousUserId = process.env.NEWSMAN_USER_ID;
const previousApiKey = process.env.NEWSMAN_API_KEY;
process.env.NEWSMAN_USER_ID = "";
process.env.NEWSMAN_API_KEY = "";

const server = createBridgeServer({ actionApiKey: "test-action-key" });

try {
  await listen(server, port);
  await check("health endpoint", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const data = await response.json();
    assert(response.status === 200 && data.ok === true, "health did not return ok");
  });

  await check("requires action auth", async () => {
    const response = await fetch(`${baseUrl}/tools/newsman_list_all`, { method: "POST" });
    assert(response.status === 401, "missing auth was not rejected");
  });

  await check("dry-run import works without NewsMAN credentials", async () => {
    const response = await fetch(`${baseUrl}/tools/newsman_import_csv`, {
      method: "POST",
      headers: {
        "authorization": "Bearer test-action-key",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        list_id: "123",
        segments: null,
        csv_data: "email\nana@example.com",
        dry_run: true
      })
    });
    const data = await response.json();
    assert(response.status === 200 && data.ok === true && data.result.dry_run === true, "dry-run import failed");
  });

  await check("live consequential call still requires confirm", async () => {
    const response = await fetch(`${baseUrl}/tools/newsman_segment_refresh`, {
      method: "POST",
      headers: {
        "authorization": "Bearer test-action-key",
        "content-type": "application/json"
      },
      body: JSON.stringify({ segment_id: "456", confirm: false })
    });
    const data = await response.json();
    assert(response.status === 500 && data.error.includes("confirm=true"), "confirm guard did not trigger");
  });
} finally {
  await close(server);
  restoreEnv("NEWSMAN_USER_ID", previousUserId);
  restoreEnv("NEWSMAN_API_KEY", previousApiKey);
}

async function check(name, fn) {
  await fn();
  console.log(`OK ${name}`);
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
