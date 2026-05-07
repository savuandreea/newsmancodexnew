# AI Agent Targets

NewsMAN is the shared name for the broader NewsMAN AI-agent connector.

## Codex

Status: implemented.

- Local Codex plugin manifest in `.codex-plugin/plugin.json`.
- MCP server in `scripts/newsman-mcp-server.mjs`.
- Skill instructions in `skills/newsman/SKILL.md`.
- Credentials are read from `NEWSMAN_USER_ID` and `NEWSMAN_API_KEY`.

## ChatGPT

Status: blueprint added.

Files:

- `apps/chatgpt/instructions.md`
- `apps/chatgpt/openapi.yaml`
- `apps/chatgpt/README.md`

Use the same safety model and tool surface:

- read-only inspection first;
- dry-run imports by default;
- explicit confirmation before live imports, sends, scheduling, workflow status changes, segment refreshes, or other writes;
- no credentials in prompts, source code, docs, logs, or shared files.

## Gemini

Status: blueprint added.

Files:

- `apps/gemini/system-instructions.md`
- `apps/gemini/function-declarations.json`
- `apps/gemini/README.md`

Use Gemini function declarations to mirror the same tool concepts and approval gates.

## Shared Safety Contract

SafetyFirst: first verify, then touch.

Nothing live happens without explicit user approval.

Every implementation should report:

- target account/list/segment/workflow/newsletter;
- intended action;
- dry-run or preview result when available;
- exact confirmation needed for live actions;
- what was tested and what remains untested.
