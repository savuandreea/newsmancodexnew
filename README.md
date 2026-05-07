# NewsMAN

![NewsMAN logo](assets/newsman-logo.svg)

Safe AI-agent connector for NewsMAN. The current implementation is a local Codex plugin/MCP server for querying and guarded operations across NewsMAN lists, imports, segments, automations, newsletters, and reports, with ChatGPT and Gemini integration blueprints alongside it.

## What It Does

- Lists NewsMAN lists and subscriber counts.
- Looks up subscribers by email.
- Imports subscribers in small batches, with `dry_run=true` by default and `confirm=true` required for live imports.
- Creates native NewsMAN CSV/JSONL background import tasks only after dry-run and `confirm=true`.
- Checks native NewsMAN background import status.
- Lists, searches, counts, refreshes, and reads subscribers from segments.
- Lists automations, reads workflow details, reads automation stats, and changes workflow status only with `confirm=true`.
- Creates newsletter drafts only with `confirm=true`.
- Updates subscriber properties and tags only with `confirm=true`.
- Sends newsletter tests only when `confirm=true`.
- Schedules or confirms newsletters only when `confirm=true`.
- Reads campaign statistics.
- Exposes `newsman_api_call` for NewsMAN API methods not wrapped yet, while requiring `confirm=true` for write-style generic calls.

## AI Agent Targets

- Codex: supported now through this local plugin and MCP server.
- ChatGPT: blueprint included for a compatible instructions/actions layer over the same safety model.
- Gemini: blueprint included for compatible function declarations and system instructions over the same safety model.

The shared rule is the same everywhere: inspect first, dry-run or preview where possible, and require explicit approval before live actions.

## Credentials

Never commit real credentials. Set these on each laptop:

```powershell
setx NEWSMAN_USER_ID "your-user-id"
setx NEWSMAN_API_KEY "your-api-key"
```

Restart Codex after setting them.

## Install Locally

Fast install on any Windows PC:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\install-newsman-plugin.ps1
```

Manual install:

1. Copy this folder to:

```text
<your-codex-plugins-folder>\newsman-ai-sync
```

2. Add this marketplace entry to:

```text
<your-agent-config-folder>\plugins\marketplace.json
```

```json
{
  "name": "newsman-ai-sync",
  "source": {
    "source": "local",
    "path": "./plugins/newsman-ai-sync"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Productivity"
}
```

3. Restart Codex and enable the plugin from Pluginuri.

## Safety

NewsMAN follows SafetyTools for AI Agents:

- SafetyFirst: first verify, then touch.
- Dry-run subscriber imports by default.
- Require `confirm=true` before live imports, subscriber writes, newsletter draft creation, send tests, scheduling, confirmation, and write-style generic API calls.
- Keep credentials out of source code and read them only from `NEWSMAN_USER_ID` and `NEWSMAN_API_KEY`.
- Do not publish, send, import, or put anything live without explicit user approval.

## References

- NewsMAN API KB: `https://kb.newsman.ro/api/1.2/`
- NewsMAN PHP API client: `https://github.com/Newsman/newsman-api-php`
- NewsMAN WordPress plugin: `https://github.com/Newsman/WP-Plugin-NewsmanApp`
- NewsMAN OpenCart plugin: `https://github.com/Newsman/OpenCart4-Newsman`
