---
name: newsman
description: Use when working with NewsMAN email marketing through the local Codex plugin: subscribers, lists, imports, newsletter drafts, tests, scheduling, reports, segments, and generic NewsMAN API calls.
---

# NewsMAN

Use the NewsMAN MCP tools exposed by this plugin for NewsMAN account work.

## Credentials

The MCP server reads credentials from environment variables:

- `NEWSMAN_USER_ID`
- `NEWSMAN_API_KEY`

Do not ask the user to paste credentials into chat unless they explicitly choose that route. Prefer setting environment variables outside the transcript.

## Common Workflow

1. Call `newsman_list_all` to identify the list ID.
2. For subscriber work, use `newsman_subscriber_get_by_email`, `newsman_subscriber_save_subscribe`, `newsman_subscriber_update_props`, or `newsman_import_subscribers`.
3. For newsletters, create a draft with `newsman_newsletter_create`, then use `newsman_newsletter_send_test`.
4. Only schedule or confirm sending when the user explicitly asks for it. Use the `confirm: true` argument required by the sending tools.
5. For endpoints not wrapped yet, use `newsman_api_call` with the exact NewsMAN API method name.

## Notes

- REST endpoint pattern uses the NewsMAN user ID, API key, and method name in the documented URL path.
- NewsMAN API documentation: `https://kb.newsman.com/api/1.2/`
