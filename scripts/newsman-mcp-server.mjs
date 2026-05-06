#!/usr/bin/env node

const API_BASE = "https://ssl.newsman.app/api/1.2/rest";
const MAX_IMPORT_BATCH = 500;

const input = process.stdin;
let buffer = "";

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

const tools = [
  {
    name: "newsman_api_call",
    description: "Call any NewsMAN REST API method by name, for endpoints not wrapped by a dedicated tool.",
    inputSchema: {
      type: "object",
      properties: {
        method: { type: "string", description: "NewsMAN method, for example list.all or newsletter.stats." },
        http_method: { type: "string", enum: ["GET", "POST"], default: "GET" },
        params: { type: "object", additionalProperties: true, default: {} }
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
        props: { type: ["object", "null"], additionalProperties: true, default: null }
      },
      required: ["list_id", "email"]
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
        props: { type: "object", additionalProperties: true }
      },
      required: ["list_id", "props"]
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
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["list_id", "tags"]
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
        dry_run: { type: "boolean", default: true }
      },
      required: ["list_id", "subscribers"]
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
        newsletter_props: { type: ["object", "null"], additionalProperties: true, default: null }
      },
      required: ["list_id", "subject"]
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
      serverInfo: { name: "newsman", version: "0.1.0" }
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
      return callNewsman(args.method, args.params ?? {}, args.http_method ?? "GET");
    case "newsman_list_all":
      return callNewsman("list.all", {}, "GET");
    case "newsman_list_subscribers":
      return callNewsman("list.getSubscribers", pick(args, ["list_id", "status", "since", "start_page", "limit"]), "GET");
    case "newsman_subscriber_get_by_email":
      return callNewsman("subscriber.getByEmail", pick(args, ["list_id", "email"]), "GET");
    case "newsman_subscriber_save_subscribe":
      return callNewsman("subscriber.saveSubscribe", pick(args, ["list_id", "email", "firstname", "lastname", "ip", "props"]), "POST");
    case "newsman_subscriber_update_props":
      requireSubscriberReference(args);
      return callNewsman("subscriber.updateProps", pick(args, ["list_id", "subscriber_id", "email", "props"]), "POST");
    case "newsman_subscriber_add_tags":
      requireSubscriberReference(args);
      return callNewsman("subscriber.addTags", pick(args, ["list_id", "subscriber_id", "email", "tags"]), "POST");
    case "newsman_import_subscribers":
      return importSubscribers(args);
    case "newsman_segment_subscribers":
      return callNewsman("segment.getSubscribers", pick(args, ["segment_id", "start", "limit"]), "GET");
    case "newsman_newsletter_all":
      return callNewsman("newsletter.all", pick(args, ["list_id", "start_date", "stop_date", "status", "start", "limit"]), "GET");
    case "newsman_newsletter_create":
      return createNewsletter(args);
    case "newsman_newsletter_send_test":
      requireConfirm(args, "send a newsletter test");
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
  if (args.dry_run !== false) {
    return {
      dry_run: true,
      message: "No subscribers were sent to NewsMAN. Re-run with dry_run=false to import.",
      count: subscribers.length,
      sample: subscribers.slice(0, 5)
    };
  }

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

async function callNewsman(method, params = {}, httpMethod = "GET") {
  const userId = process.env.NEWSMAN_USER_ID;
  const apiKey = process.env.NEWSMAN_API_KEY;
  if (!userId || !apiKey) {
    throw new Error("Missing NEWSMAN_USER_ID or NEWSMAN_API_KEY environment variable.");
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(method)) {
    throw new Error(`Invalid NewsMAN method: ${method}`);
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

function normalizeEmails(args) {
  if (Array.isArray(args.emails)) {
    return { ...args, emails: args.emails.join(",") };
  }
  return args;
}

function requireSubscriberReference(args) {
  if (!args.subscriber_id && !args.email) {
    throw new Error("Provide subscriber_id or email.");
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
