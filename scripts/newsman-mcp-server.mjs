#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const API_BASE = "https://ssl.newsman.app/api/1.2/rest";
const MAX_IMPORT_BATCH = 500;
const SERVER_VERSION = "0.2.0";
const ALLOWED_HTTP_METHODS = new Set(["GET", "POST"]);
const WRITE_METHOD_PATTERN = /\.(add|confirm|create|delete|import|remove|save|schedule|send|subscribe|unsubscribe|update)/i;
const MAX_JSONL_IMPORT_LINES = 100000;
const MAX_CSV_IMPORT_ROWS = 10000;

let buffer = "";

function startStdioServer(input = process.stdin) {
  input.setEncoding("utf8");
  input.on("data", (chunk) => {
    buffer += chunk;
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        handleLine(line).catch((error) => {
          writeError(null, -32603, error.message);
        });
      }
    }
  });
  input.on("end", () => {
    const line = buffer.trim();
    if (line) {
      handleLine(line).catch((error) => {
        writeError(null, -32603, error.message);
      });
    }
  });
}

const tools = [
  {
    name: "newsman_api_call",
    description: "Call any NewsMAN REST API method by name, for endpoints not wrapped by a dedicated tool.",
    inputSchema: {
      type: "object",
      properties: {
        method: { type: "string", description: "NewsMAN method, for example list.all or newsletter.stats." },
        http_method: { type: "string", enum: ["GET", "POST"], default: "GET" },
        params: { type: "object", additionalProperties: true, default: {} },
        confirm: {
          type: "boolean",
          default: false,
          description: "Must be true for write-style generic API methods."
        }
      },
      required: ["method"]
    }
  },
  {
    name: "newsman_list_all",
    description: "List all NewsMAN email lists available to the API user.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "newsman_list_subscribers",
    description: "Get subscribers from a NewsMAN list by status and optional date.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: ["string", "number"] },
        status: { type: "string", enum: ["subscribed", "unsubscribed", "bounced", "spam", "inactivated"] },
        since: { type: ["string", "null"], description: "UTC date YYYY-MM-DD HH:mm:ss.", default: null },
        start_page: { type: ["number", "null"], default: 0 },
        limit: { type: ["number", "null"], default: 100 }
      },
      required: ["list_id", "status"]
    }
  },
  {
    name: "newsman_subscriber_get_by_email",
    description: "Find a NewsMAN subscriber by list ID and email address.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: ["string", "number"] },
        email: { type: "string" }
      },
      required: ["list_id", "email"]
    }
  },
  {
    name: "newsman_subscriber_save_subscribe",
    description: "Create or resubscribe a subscriber in a NewsMAN list.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: ["string", "number"] },
        email: { type: "string" },
        firstname: { type: ["string", "null"], default: null },
        lastname: { type: ["string", "null"], default: null },
        ip: { type: "string", default: "127.0.0.1" },
        props: { type: ["object", "null"], additionalProperties: true, default: null },
        confirm: { type: "boolean", description: "Must be true to create or resubscribe." }
      },
      required: ["list_id", "email", "confirm"]
    }
  },
  {
    name: "newsman_subscriber_update_props",
    description: "Update custom properties for a subscriber.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: ["string", "number"] },
        subscriber_id: { type: ["string", "number", "null"], default: null },
        email: { type: ["string", "null"], default: null },
        props: { type: "object", additionalProperties: true },
        confirm: { type: "boolean", description: "Must be true to update subscriber properties." }
      },
      required: ["list_id", "props", "confirm"]
    }
  },
  {
    name: "newsman_subscriber_add_tags",
    description: "Add one or more tags to a subscriber.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: ["string", "number"] },
        subscriber_id: { type: ["string", "number", "null"], default: null },
        email: { type: ["string", "null"], default: null },
        tags: { type: "array", items: { type: "string" } },
        confirm: { type: "boolean", description: "Must be true to add subscriber tags." }
      },
      required: ["list_id", "tags", "confirm"]
    }
  },
  {
    name: "newsman_import_subscribers",
    description: "Import a small batch of subscribers by repeatedly calling subscriber.saveSubscribe.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: ["string", "number"] },
        subscribers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              email: { type: "string" },
              firstname: { type: ["string", "null"] },
              lastname: { type: ["string", "null"] },
              ip: { type: ["string", "null"] },
              props: { type: ["object", "null"], additionalProperties: true }
            },
            required: ["email"]
          }
        },
        default_ip: { type: "string", default: "127.0.0.1" },
        dry_run: { type: "boolean", default: true },
        confirm: { type: "boolean", description: "Must be true when dry_run=false." }
      },
      required: ["list_id", "subscribers"]
    }
  },
  {
    name: "newsman_import_status",
    description: "Get the status of a NewsMAN background import task.",
    inputSchema: {
      type: "object",
      properties: {
        import_id: { type: ["string", "number"], description: "Import task ID returned by NewsMAN." }
      },
      required: ["import_id"]
    }
  },
  {
    name: "newsman_import_csv",
    description: "Create a NewsMAN background import task from CSV data. Defaults to dry-run.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: ["string", "number"] },
        segments: {
          type: ["array", "null"],
          items: { type: ["string", "number"] },
          default: null,
          description: "Segment IDs or tag names using tag_ prefix. Use null to import only to the list."
        },
        csv_data: { type: "string" },
        dry_run: { type: "boolean", default: true },
        confirm: { type: "boolean", description: "Must be true when dry_run=false." }
      },
      required: ["list_id", "segments", "csv_data"]
    }
  },
  {
    name: "newsman_import_schedule_csv",
    description: "Schedule a NewsMAN background import task from CSV data. Defaults to dry-run.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: ["string", "number"] },
        segments: {
          type: ["array", "null"],
          items: { type: ["string", "number"] },
          default: null,
          description: "Segment IDs or tag names using tag_ prefix. Use null to import only to the list."
        },
        csv_data: { type: "string" },
        delay: { type: ["string", "number"], description: "Delay accepted by NewsMAN." },
        dry_run: { type: "boolean", default: true },
        confirm: { type: "boolean", description: "Must be true when dry_run=false." }
      },
      required: ["list_id", "segments", "csv_data", "delay"]
    }
  },
  {
    name: "newsman_import_schedule_jsonl",
    description: "Schedule a NewsMAN background import task from JSONL data. Defaults to dry-run.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: ["string", "number"] },
        segments: {
          type: ["array", "null"],
          items: { type: ["string", "number"] },
          default: null,
          description: "Segment IDs or tag names using tag_ prefix. Use null to import only to the list."
        },
        json_lines: { type: "string" },
        delay: { type: ["string", "number"], default: 0, description: "Delay in seconds. Use 0 for immediate scheduling." },
        dry_run: { type: "boolean", default: true },
        confirm: { type: "boolean", description: "Must be true when dry_run=false." }
      },
      required: ["list_id", "segments", "json_lines"]
    }
  },
  {
    name: "newsman_segment_all",
    description: "List all NewsMAN segments for a list.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: ["string", "number"] }
      },
      required: ["list_id"]
    }
  },
  {
    name: "newsman_segment_search",
    description: "Search NewsMAN segments for a list by regex/name pattern.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: ["string", "number"] },
        regex: { type: "string", description: "Regex accepted by NewsMAN." }
      },
      required: ["list_id", "regex"]
    }
  },
  {
    name: "newsman_segment_count",
    description: "Get the number of active subscribers in a NewsMAN segment.",
    inputSchema: {
      type: "object",
      properties: {
        segment_id: { type: ["string", "number"] }
      },
      required: ["segment_id"]
    }
  },
  {
    name: "newsman_segment_subscribers",
    description: "Get subscribers from a NewsMAN segment.",
    inputSchema: {
      type: "object",
      properties: {
        segment_id: { type: ["string", "number"] },
        start: { type: ["number", "null"], default: 0 },
        limit: { type: ["number", "null"], default: 100 }
      },
      required: ["segment_id"]
    }
  },
  {
    name: "newsman_segment_refresh",
    description: "Trigger a NewsMAN segment refresh. Requires explicit confirm=true.",
    inputSchema: {
      type: "object",
      properties: {
        segment_id: { type: ["string", "number"] },
        confirm: { type: "boolean", description: "Must be true to refresh the segment." }
      },
      required: ["segment_id", "confirm"]
    }
  },
  {
    name: "newsman_automation_all",
    description: "List NewsMAN automation workflows by optional filters.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: ["string", "number"] },
        name: { type: "string", default: "" },
        type: { type: "string", default: "all" },
        status: { type: ["string", "number"], default: "all" },
        start_date: { type: "string" },
        stop_date: { type: "string" }
      },
      required: ["list_id", "start_date", "stop_date"]
    }
  },
  {
    name: "newsman_automation_get_workflow",
    description: "Get details for a NewsMAN automation workflow.",
    inputSchema: {
      type: "object",
      properties: {
        workflow_id: { type: ["string", "number"] }
      },
      required: ["workflow_id"]
    }
  },
  {
    name: "newsman_automation_stats",
    description: "Get NewsMAN automation workflow stats grouped by days.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: ["string", "number"] },
        workflow_ids: {
          type: ["array", "string", "boolean", "null"],
          items: { type: ["string", "number"] },
          default: false
        },
        trigger_id: { type: ["string", "number", "boolean", "null"], default: false },
        start_date: { type: ["string", "boolean"], default: false },
        stop_date: { type: ["string", "boolean"], default: false },
        days: { type: ["string", "number", "boolean", "null"], default: false },
        month: { type: ["string", "number", "boolean", "null"], default: false }
      },
      required: ["list_id"]
    }
  },
  {
    name: "newsman_automation_set_workflow_status",
    description: "Set a NewsMAN automation workflow status. Requires explicit confirm=true.",
    inputSchema: {
      type: "object",
      properties: {
        workflow_id: { type: ["string", "number"] },
        status: { type: "string" },
        confirm: { type: "boolean", description: "Must be true to change workflow status." }
      },
      required: ["workflow_id", "status", "confirm"]
    }
  },
  {
    name: "newsman_newsletter_all",
    description: "List NewsMAN newsletters/campaigns for a list by date and status.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: ["string", "number"] },
        start_date: { type: ["string", "boolean"], default: false },
        stop_date: { type: ["string", "boolean"], default: false },
        status: { type: ["string", "number"], default: "all" },
        start: { type: ["number", "null"], default: 0 },
        limit: { type: ["number", "null"], default: 50 }
      },
      required: ["list_id"]
    }
  },
  {
    name: "newsman_newsletter_create",
    description: "Create a NewsMAN newsletter draft.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: ["string", "number"] },
        subject: { type: "string" },
        html: { type: ["string", "boolean"], default: false },
        text: { type: ["string", "boolean"], default: false },
        use_best_time: { type: ["boolean", "string"], default: false },
        newsletter_props: { type: ["object", "null"], additionalProperties: true, default: null },
        confirm: { type: "boolean", description: "Must be true to create a newsletter draft." }
      },
      required: ["list_id", "subject", "confirm"]
    }
  },
  {
    name: "newsman_newsletter_send_test",
    description: "Send a test email for a newsletter draft.",
    inputSchema: {
      type: "object",
      properties: {
        newsletter_id: { type: ["string", "number"] },
        emails: { type: ["array", "string"], items: { type: "string" } },
        confirm: { type: "boolean", description: "Must be true to send the test." }
      },
      required: ["newsletter_id", "emails", "confirm"]
    }
  },
  {
    name: "newsman_newsletter_schedule",
    description: "Schedule a newsletter. Requires explicit confirm=true.",
    inputSchema: {
      type: "object",
      properties: {
        newsletter_id: { type: ["string", "number"] },
        send_date: { type: "string", description: "Scheduled date accepted by NewsMAN." },
        confirm: { type: "boolean", description: "Must be true to schedule." }
      },
      required: ["newsletter_id", "send_date", "confirm"]
    }
  },
  {
    name: "newsman_newsletter_confirm",
    description: "Confirm a newsletter for sending through the API. Requires explicit confirm=true.",
    inputSchema: {
      type: "object",
      properties: {
        newsletter_id: { type: ["string", "number"] },
        confirm: { type: "boolean", description: "Must be true to confirm sending." }
      },
      required: ["newsletter_id", "confirm"]
    }
  },
  {
    name: "newsman_newsletter_stats",
    description: "Get campaign statistics for a newsletter.",
    inputSchema: {
      type: "object",
      properties: {
        newsletter_id: { type: ["string", "number"] }
      },
      required: ["newsletter_id"]
    }
  }
];

async function handleLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    writeError(null, -32700, `Invalid JSON: ${error.message}`);
    return;
  }

  if (message.id === undefined) {
    return;
  }

  try {
    const result = await dispatch(message.method, message.params ?? {});
    writeMessage({ jsonrpc: "2.0", id: message.id, result });
  } catch (error) {
    writeError(message.id, error.code ?? -32603, error.message);
  }
}

async function dispatch(method, params) {
  if (method === "initialize") {
    return {
      protocolVersion: params.protocolVersion ?? "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "newsman-ai-sync", version: SERVER_VERSION }
    };
  }

  if (method === "tools/list") {
    return { tools };
  }

  if (method === "tools/call") {
    const name = params.name;
    const args = params.arguments ?? {};
    const result = await callTool(name, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }

  throw Object.assign(new Error(`Unknown method: ${method}`), { code: -32601 });
}

async function callTool(name, args) {
  switch (name) {
    case "newsman_api_call":
      requireGenericCallConfirmation(args);
      return callNewsman(args.method, args.params ?? {}, args.http_method ?? "GET");
    case "newsman_list_all":
      return callNewsman("list.all", {}, "GET");
    case "newsman_list_subscribers":
      return callNewsman("list.getSubscribers", pick(args, ["list_id", "status", "since", "start_page", "limit"]), "GET");
    case "newsman_subscriber_get_by_email":
      validateEmail(args.email, "email");
      return callNewsman("subscriber.getByEmail", pick(args, ["list_id", "email"]), "GET");
    case "newsman_subscriber_save_subscribe":
      requireConfirm(args, "create or resubscribe a subscriber");
      validateEmail(args.email, "email");
      return callNewsman("subscriber.saveSubscribe", pick(args, ["list_id", "email", "firstname", "lastname", "ip", "props"]), "POST");
    case "newsman_subscriber_update_props":
      requireSubscriberReference(args);
      requireConfirm(args, "update subscriber properties");
      if (args.email) validateEmail(args.email, "email");
      return callNewsman("subscriber.updateProps", pick(args, ["list_id", "subscriber_id", "email", "props"]), "POST");
    case "newsman_subscriber_add_tags":
      requireSubscriberReference(args);
      requireConfirm(args, "add tags to a subscriber");
      if (args.email) validateEmail(args.email, "email");
      return callNewsman("subscriber.addTags", pick(args, ["list_id", "subscriber_id", "email", "tags"]), "POST");
    case "newsman_import_subscribers":
      return importSubscribers(args);
    case "newsman_import_status":
      return callNewsman("import.status", pick(args, ["import_id"]), "GET");
    case "newsman_import_csv":
      return importCsv(args, "import.csv");
    case "newsman_import_schedule_csv":
      return importCsv(args, "import.schedulecsv", ["delay"]);
    case "newsman_import_schedule_jsonl":
      return importJsonl(args);
    case "newsman_segment_all":
      return callNewsman("segment.all", pick(args, ["list_id"]), "GET");
    case "newsman_segment_search":
      return callNewsman("segment.search", pick(args, ["list_id", "regex"]), "GET");
    case "newsman_segment_count":
      return callNewsman("segment.count", pick(args, ["segment_id"]), "GET");
    case "newsman_segment_subscribers":
      return callNewsman("segment.getSubscribers", pick(args, ["segment_id", "start", "limit"]), "GET");
    case "newsman_segment_refresh":
      requireConfirm(args, "refresh a segment");
      return callNewsman("segment.refresh", pick(args, ["segment_id"]), "POST");
    case "newsman_automation_all":
      return callNewsman("automation.all", withDefaults(args, { name: "", type: "all", status: "all" }, ["list_id", "name", "type", "status", "start_date", "stop_date"]), "GET");
    case "newsman_automation_get_workflow":
      return callNewsman("automation.getWorkflow", pick(args, ["workflow_id"]), "GET");
    case "newsman_automation_stats":
      return callNewsman("automation.stats", pick(args, ["list_id", "workflow_ids", "trigger_id", "start_date", "stop_date", "days", "month"]), "GET");
    case "newsman_automation_set_workflow_status":
      requireConfirm(args, "change automation workflow status");
      return callNewsman("automation.setWorkflowStatus", pick(args, ["workflow_id", "status"]), "POST");
    case "newsman_newsletter_all":
      return callNewsman("newsletter.all", pick(args, ["list_id", "start_date", "stop_date", "status", "start", "limit"]), "GET");
    case "newsman_newsletter_create":
      return createNewsletter(args);
    case "newsman_newsletter_send_test":
      requireConfirm(args, "send a newsletter test");
      validateEmails(args.emails, "emails");
      return callNewsman("newsletter.sendTest", normalizeEmails(pick(args, ["newsletter_id", "emails"])), "POST");
    case "newsman_newsletter_schedule":
      requireConfirm(args, "schedule a newsletter");
      return callNewsman("newsletter.schedule", pick(args, ["newsletter_id", "send_date"]), "POST");
    case "newsman_newsletter_confirm":
      requireConfirm(args, "confirm a newsletter");
      return callNewsman("newsletter.confirm", pick(args, ["newsletter_id"]), "POST");
    case "newsman_newsletter_stats":
      return callNewsman("newsletter.stats", pick(args, ["newsletter_id"]), "GET");
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function createNewsletter(args) {
  requireConfirm(args, "create a newsletter draft");
  const props = {
    encoding: "utf-8",
    subject: args.subject,
    use_best_time: args.use_best_time ?? false,
    ...(args.newsletter_props ?? {})
  };
  return callNewsman("newsletter.create", {
    list_id: args.list_id,
    html: args.html ?? false,
    text: args.text ?? false,
    newsletter_props: props
  }, "POST");
}

async function importSubscribers(args) {
  const subscribers = Array.isArray(args.subscribers) ? args.subscribers : [];
  if (subscribers.length === 0) {
    throw new Error("subscribers must contain at least one subscriber.");
  }
  if (subscribers.length > MAX_IMPORT_BATCH) {
    throw new Error(`This tool accepts up to ${MAX_IMPORT_BATCH} subscribers per call. Split larger imports into batches.`);
  }
  const missingEmail = subscribers.findIndex((subscriber) => !subscriber.email);
  if (missingEmail >= 0) {
    throw new Error(`Subscriber at index ${missingEmail} is missing email.`);
  }
  subscribers.forEach((subscriber, index) => validateEmail(subscriber.email, `subscribers[${index}].email`));
  if (args.dry_run !== false) {
    return {
      dry_run: true,
      message: "No subscribers were sent to NewsMAN. Re-run with dry_run=false to import.",
      count: subscribers.length,
      sample: subscribers.slice(0, 5)
    };
  }
  requireConfirm(args, "import subscribers");

  const results = [];
  for (const subscriber of subscribers) {
    try {
      const response = await callNewsman("subscriber.saveSubscribe", {
        list_id: args.list_id,
        email: subscriber.email,
        firstname: subscriber.firstname ?? null,
        lastname: subscriber.lastname ?? null,
        ip: subscriber.ip ?? args.default_ip ?? "127.0.0.1",
        props: subscriber.props ?? null
      }, "POST");
      results.push({ email: subscriber.email, ok: true, response });
    } catch (error) {
      results.push({ email: subscriber.email, ok: false, error: error.message });
    }
  }

  return {
    imported: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results
  };
}

async function importCsv(args, method, extraKeys = []) {
  requireNonEmptyString(args.csv_data, "csv_data");
  validateCsvImportData(args.csv_data);
  if (args.dry_run !== false) {
    return {
      dry_run: true,
      message: `No CSV import task was created. Re-run with dry_run=false and confirm=true to call ${method}.`,
      list_id: args.list_id,
      segments: args.segments ?? null,
      delay: args.delay ?? null,
      csv_bytes: Buffer.byteLength(args.csv_data, "utf8")
    };
  }
  requireConfirm(args, "create a CSV import task");
  return callNewsman(method, pick(args, ["list_id", "segments", "csv_data", ...extraKeys]), "POST");
}

async function importJsonl(args) {
  requireNonEmptyString(args.json_lines, "json_lines");
  const lineCount = countNonEmptyLines(args.json_lines);
  if (lineCount > MAX_JSONL_IMPORT_LINES) {
    throw new Error(`json_lines accepts up to ${MAX_JSONL_IMPORT_LINES} non-empty lines per call.`);
  }
  validateJsonLines(args.json_lines);
  if (args.dry_run !== false) {
    return {
      dry_run: true,
      message: "No JSONL import task was created. Re-run with dry_run=false and confirm=true to call import.schedulejsonl.",
      list_id: args.list_id,
      segments: args.segments ?? null,
      delay: args.delay ?? 0,
      line_count: lineCount
    };
  }
  requireConfirm(args, "create a JSONL import task");
  return callNewsman("import.schedulejsonl", pick(args, ["list_id", "segments", "json_lines", "delay"]), "POST");
}

async function callNewsman(method, params = {}, httpMethod = "GET") {
  if (!/^[a-zA-Z0-9_.-]+$/.test(method)) {
    throw new Error(`Invalid NewsMAN method: ${method}`);
  }
  if (!ALLOWED_HTTP_METHODS.has(httpMethod.toUpperCase())) {
    throw new Error(`Unsupported HTTP method: ${httpMethod}. Use GET or POST.`);
  }
  const userId = process.env.NEWSMAN_USER_ID;
  const apiKey = process.env.NEWSMAN_API_KEY;
  if (!userId || !apiKey) {
    throw new Error("Missing NEWSMAN_USER_ID or NEWSMAN_API_KEY environment variable.");
  }

  const url = new URL(`${API_BASE}/${encodeURIComponent(userId)}/${encodeURIComponent(apiKey)}/${method}.json`);
  const requestInit = { method: httpMethod.toUpperCase(), headers: {} };
  const encodedParams = new URLSearchParams();
  appendParams(encodedParams, params);

  if (requestInit.method === "GET") {
    for (const [key, value] of encodedParams.entries()) {
      url.searchParams.append(key, value);
    }
  } else {
    requestInit.headers["content-type"] = "application/x-www-form-urlencoded";
    requestInit.body = encodedParams;
  }

  const response = await fetch(url, requestInit);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok || (data && typeof data === "object" && data.err)) {
    const message = data && typeof data === "object" && data.message ? data.message : response.statusText;
    throw new Error(`NewsMAN API error (${response.status}): ${message}`);
  }

  return data;
}

function appendParams(searchParams, value, prefix = "") {
  if (value === undefined || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendParams(searchParams, item, `${prefix}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      const nextPrefix = prefix ? `${prefix}[${key}]` : key;
      appendParams(searchParams, nestedValue, nextPrefix);
    }
    return;
  }
  searchParams.append(prefix, String(value));
}

function pick(source, keys) {
  const result = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      result[key] = source[key];
    }
  }
  return result;
}

function withDefaults(source, defaults, keys) {
  return pick({ ...defaults, ...source }, keys);
}

function normalizeEmails(args) {
  if (Array.isArray(args.emails)) {
    return { ...args, emails: args.emails.join(",") };
  }
  return args;
}

function validateEmails(value, field) {
  const emails = Array.isArray(value) ? value : String(value ?? "").split(",");
  if (emails.length === 0) {
    throw new Error(`${field} must contain at least one email address.`);
  }
  emails.forEach((email, index) => validateEmail(email.trim(), `${field}[${index}]`));
}

function validateEmail(value, field) {
  const email = String(value ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`${field} must be a valid email address.`);
  }
}

function requireNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string.`);
  }
}

function countNonEmptyLines(value) {
  return String(value)
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "").length;
}

function validateCsvImportData(csvData) {
  const rows = String(csvData).split(/\r?\n/).filter((line) => line.trim() !== "");
  if (rows.length === 0) {
    throw new Error("csv_data must contain a header row.");
  }
  if (rows.length - 1 > MAX_CSV_IMPORT_ROWS) {
    throw new Error(`csv_data accepts up to ${MAX_CSV_IMPORT_ROWS} data rows per call.`);
  }
  const headers = rows[0].split(",").map((header) => header.trim().replace(/^"|"$/g, "").toLowerCase());
  if (!headers.includes("email")) {
    throw new Error("csv_data header must include email.");
  }
}

function validateJsonLines(jsonLines) {
  const rows = String(jsonLines).split(/\r?\n/).filter((line) => line.trim() !== "");
  rows.forEach((line, index) => {
    let item;
    try {
      item = JSON.parse(line);
    } catch (error) {
      throw new Error(`json_lines[${index}] must be valid JSON: ${error.message}`);
    }
    if (!item || typeof item !== "object" || !item.email) {
      throw new Error(`json_lines[${index}] must include email.`);
    }
    validateEmail(item.email, `json_lines[${index}].email`);
  });
}

function requireSubscriberReference(args) {
  if (!args.subscriber_id && !args.email) {
    throw new Error("Provide subscriber_id or email.");
  }
}

function requireGenericCallConfirmation(args) {
  const method = String(args.method ?? "");
  const httpMethod = String(args.http_method ?? "GET").toUpperCase();
  if (httpMethod === "POST" || WRITE_METHOD_PATTERN.test(method)) {
    requireConfirm(args, `call write-style NewsMAN API method ${method}`);
  }
}

function requireConfirm(args, action) {
  if (args.confirm !== true) {
    throw new Error(`Set confirm=true to ${action}.`);
  }
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function writeError(id, code, message) {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  startStdioServer();
}

export { callTool, dispatch, startStdioServer };
