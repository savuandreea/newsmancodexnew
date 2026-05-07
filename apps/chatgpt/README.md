# NewsMAN AI Sync for ChatGPT

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
- Keep responses as raw JSON where possible so ChatGPT can summarize them.

## Official References

- GPT Actions introduction: `https://platform.openai.com/docs/actions/introduction/what-is-a-gpt`
- GPT Actions authentication: `https://platform.openai.com/docs/actions/authentication`
- GPT Actions production notes: `https://platform.openai.com/docs/actions/production`
- ChatGPT Apps SDK overview: `https://help.openai.com/en/articles/12515353-build-with-the-apps-sdk`
