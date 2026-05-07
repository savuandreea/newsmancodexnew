---
name: newsman-ai-sync
description: Use when working with NewsMAN through the local Codex plugin: subscribers, lists, dry-run imports, native import status/tasks, segments, automations, newsletter drafts, tests, scheduling, reports, and generic NewsMAN API calls.
---

# NewsMAN

Use the NewsMAN MCP tools exposed by this plugin for NewsMAN account work.

SafetyTools rule: SafetyFirst, first verify then touch. Prefer read-only calls and dry-runs. Do not create import tasks, import subscribers, update subscriber data, refresh segments, change automation status, create newsletter drafts, send tests, schedule, confirm, publish, or perform generic write-style API calls unless the user explicitly approved that exact action.

## Credentials

The MCP server reads credentials from environment variables:

- `NEWSMAN_USER_ID`
- `NEWSMAN_API_KEY`

Do not ask the user to paste credentials into chat unless they explicitly choose that route. Prefer setting environment variables outside the transcript.

## Common Workflow

1. Call `newsman_list_all` to identify the list ID.
2. For import work, inspect with `newsman_import_status` when an import ID exists; use `newsman_import_csv` or `newsman_import_schedule_jsonl` with `dry_run=true` before any live import task.
3. For segment work, inspect with `newsman_segment_all`, `newsman_segment_search`, `newsman_segment_count`, or `newsman_segment_subscribers` before any refresh or write.
4. For automation work, inspect with `newsman_automation_all`, `newsman_automation_get_workflow`, or `newsman_automation_stats` before changing workflow status.
5. For newsletters, create a draft with `newsman_newsletter_create` only after approval, then use `newsman_newsletter_send_test` only after approval.
6. Use `confirm: true` only after the user explicitly approves the exact live action.
7. For endpoints not wrapped yet, use `newsman_api_call` with the exact NewsMAN API method name. Write-style generic calls also require `confirm: true`.

## Notes

- REST endpoint pattern uses the NewsMAN user ID, API key, and method name in the documented URL path.
- NewsMAN API documentation: `https://kb.newsman.com/api/1.2/`
- SafetyTools for AI Agents: `https://github.com/AndreeaR6/SafetyTools-for-AI-Agents`
