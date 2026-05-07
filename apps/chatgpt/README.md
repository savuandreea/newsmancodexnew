# NewsMAN AI Sync for ChatGPT

![NewsMAN logo](../../assets/newsman-logo.svg)

Status: blueprint.

This folder keeps the ChatGPT-specific packaging separate from the Codex plugin while using the same NewsMAN AI Sync name, safety model, and logo.

## Recommended Paths

1. ChatGPT Apps SDK / MCP app
   - Best long-term fit for an interactive NewsMAN app inside ChatGPT.
   - Reuse the same NewsMAN MCP tool surface already implemented for Codex.
   - Requires a remote HTTPS MCP server and ChatGPT Developer Mode for testing.

2. Custom GPT Action
   - Faster first version for a Custom GPT.
   - Requires an HTTPS REST bridge in front of the local NewsMAN tool handlers.
   - Uses `openapi.yaml` in this folder as the starting schema.

## Bridge

`bridge/server.mjs` exposes the OpenAPI tool paths over HTTP and reuses the same NewsMAN MCP tool handlers used by Codex.

Local smoke test:

```powershell
node apps/chatgpt/bridge/smoke-test.mjs
```

Local run:

```powershell
setx CHATGPT_ACTION_API_KEY "replace-with-a-random-action-key"
setx NEWSMAN_USER_ID "your-user-id"
setx NEWSMAN_API_KEY "your-api-key"
node apps/chatgpt/bridge/server.mjs
```

For ChatGPT Actions, deploy this bridge behind HTTPS/TLS and replace the `servers.url` value in `openapi.yaml` with that public URL.

Credential options:

- Demo/shared account: set `NEWSMAN_USER_ID` and `NEWSMAN_API_KEY` on the bridge host.
- Manual per-user setup: leave those env vars unset and provide `newsman_user_id` plus `newsman_api_key` in the Action request fields. The bridge removes those fields before calling NewsMAN and does not echo them in responses.

## Safety Contract

- Read-only endpoints first.
- Dry-run imports by default.
- Mark write endpoints as consequential.
- Require `confirm=true` in the API payload for live imports, segment refreshes, automation status changes, newsletter draft creation, send tests, scheduling, and confirmation.
- Never place NewsMAN credentials in the GPT instructions or OpenAPI schema.

## Setup Notes

- Replace `https://your-newsman-ai-sync.example.com` in `openapi.yaml` with the deployed HTTPS bridge URL.
- Use `../../assets/newsman-logo.svg` as the GPT Builder profile/logo asset.
- Use API key or OAuth in the GPT Action editor. Do not hard-code secrets here.
- For manual NewsMAN credentials, users should fill `newsman_user_id` and `newsman_api_key` in Action fields only, not in normal chat text.
- Keep responses as raw JSON where possible so ChatGPT can summarize them.

## GPT Builder Checklist

Use these assets in ChatGPT GPT Builder:

| GPT Builder Field | Value |
| --- | --- |
| Name | `NewsMAN AI Sync` |
| Logo | `assets/newsman-logo.svg` |
| Instructions | `apps/chatgpt/instructions.md` |
| Action schema | `apps/chatgpt/openapi.yaml` |
| Authentication | API key or OAuth, configured in GPT Builder only |

The GPT Builder action will not work until `openapi.yaml` points to a deployed HTTPS bridge.

## Official References

- GPT Actions introduction: `https://platform.openai.com/docs/actions/introduction/what-is-a-gpt`
- GPT Actions authentication: `https://platform.openai.com/docs/actions/authentication`
- GPT Actions production notes: `https://platform.openai.com/docs/actions/production`
- ChatGPT Apps SDK overview: `https://help.openai.com/en/articles/12515353-build-with-the-apps-sdk`
