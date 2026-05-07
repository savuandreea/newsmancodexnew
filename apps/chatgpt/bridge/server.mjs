#!/usr/bin/env node

import http from "node:http";
import { pathToFileURL } from "node:url";
import { callTool } from "../../../scripts/newsman-mcp-server.mjs";

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 100_000;
const PORT = Number(process.env.PORT || process.env.CHATGPT_BRIDGE_PORT || DEFAULT_PORT);
let callQueue = Promise.resolve();

const allowedTools = new Set([
  "newsman_list_all",
  "newsman_import_status",
  "newsman_import_csv",
  "newsman_segment_all",
  "newsman_segment_count",
  "newsman_segment_refresh",
  "newsman_automation_all",
  "newsman_automation_stats",
  "newsman_automation_set_workflow_status"
]);

function createBridgeServer(options = {}) {
  const actionApiKey = options.actionApiKey ?? process.env.CHATGPT_ACTION_API_KEY ?? "";
  return http.createServer(async (request, response) => {
    try {
      await route(request, response, { actionApiKey });
    } catch (error) {
      sendJson(response, error.statusCode || 500, {
        ok: false,
        error: error.message || "Internal server error."
      });
    }
  });
}

async function route(request, response, context) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "NewsMAN AI Sync ChatGPT bridge",
      version: "0.2.0"
    });
    return;
  }

  if (request.method !== "POST" || !url.pathname.startsWith("/tools/")) {
    sendJson(response, 404, { ok: false, error: "Not found." });
    return;
  }

  requireActionAuth(request, context.actionApiKey);

  const toolName = decodeURIComponent(url.pathname.slice("/tools/".length));
  if (!allowedTools.has(toolName)) {
    sendJson(response, 404, { ok: false, error: `Unknown or disabled tool: ${toolName}` });
    return;
  }

  const body = await readJsonBody(request);
  const { args, credentials } = extractNewsmanCredentials(body);
  const result = await enqueueToolCall(toolName, args, credentials);
  sendJson(response, 200, { ok: true, tool: toolName, result });
}

function extractNewsmanCredentials(body) {
  const args = { ...body };
  const credentials = {
    userId: args.newsman_user_id ? String(args.newsman_user_id) : "",
    apiKey: args.newsman_api_key ? String(args.newsman_api_key) : ""
  };

  delete args.newsman_user_id;
  delete args.newsman_api_key;

  if ((credentials.userId && !credentials.apiKey) || (!credentials.userId && credentials.apiKey)) {
    const error = new Error("Provide both newsman_user_id and newsman_api_key, or neither.");
    error.statusCode = 400;
    throw error;
  }

  return { args, credentials };
}

async function enqueueToolCall(toolName, args, credentials) {
  const run = callQueue.then(() => callToolWithCredentials(toolName, args, credentials));
  callQueue = run.catch(() => {});
  return run;
}

async function callToolWithCredentials(toolName, args, credentials) {
  if (!credentials.userId && !credentials.apiKey) {
    return callTool(toolName, args);
  }

  const previousUserId = process.env.NEWSMAN_USER_ID;
  const previousApiKey = process.env.NEWSMAN_API_KEY;
  process.env.NEWSMAN_USER_ID = credentials.userId;
  process.env.NEWSMAN_API_KEY = credentials.apiKey;

  try {
    return await callTool(toolName, args);
  } finally {
    restoreEnv("NEWSMAN_USER_ID", previousUserId);
    restoreEnv("NEWSMAN_API_KEY", previousApiKey);
  }
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function requireActionAuth(request, actionApiKey) {
  if (!actionApiKey) {
    return;
  }
  const header = request.headers.authorization || "";
  const value = header.replace(/^Bearer\s+/i, "").trim();
  if (value !== actionApiKey) {
    const error = new Error("Unauthorized.");
    error.statusCode = 401;
    throw error;
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) {
      const error = new Error(`Request body is too large. Limit is ${MAX_BODY_BYTES} bytes.`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const wrapped = new Error(`Invalid JSON body: ${error.message}`);
    wrapped.statusCode = 400;
    throw wrapped;
  }
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(body);
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  const server = createBridgeServer();
  server.listen(PORT, () => {
    console.log(`NewsMAN AI Sync ChatGPT bridge listening on http://localhost:${PORT}`);
  });
}

export { createBridgeServer };
