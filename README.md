# NewsMAN Codex Plugin

Local Codex plugin for working with the NewsMAN REST API.

## What It Does

- Lists NewsMAN lists and subscriber counts.
- Looks up subscribers by email.
- Imports subscribers in small batches, with `dry_run=true` by default.
- Creates newsletter drafts.
- Sends newsletter tests only when `confirm=true`.
- Schedules or confirms newsletters only when `confirm=true`.
- Reads campaign statistics.
- Exposes `newsman_api_call` for NewsMAN API methods not wrapped yet.

## Credentials

Never commit real credentials. Set these on each laptop:

```powershell
setx NEWSMAN_USER_ID "your-user-id"
setx NEWSMAN_API_KEY "your-api-key"
```

Restart Codex after setting them.

## Install Locally

1. Copy this folder to:

```text
C:\Users\<you>\plugins\newsman
```

2. Add this marketplace entry to:

```text
C:\Users\<you>\.agents\plugins\marketplace.json
```

```json
{
  "name": "newsman",
  "source": {
    "source": "local",
    "path": "./plugins/newsman"
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

This plugin intentionally blocks destructive or sending-style actions unless a tool receives explicit `confirm=true`. Subscriber imports default to dry-run mode.
