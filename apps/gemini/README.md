# NewsMAN for Gemini

Status: blueprint.

This folder keeps Gemini-specific packaging separate from the Codex plugin.

Gemini supports tool/function calling through function declarations. The model can propose a function call and your application is responsible for executing it, validating risk, and sending the function response back.

## Files

- `function-declarations.json`: starter declarations for read-only and guarded NewsMAN tools.
- `system-instructions.md`: safety and behavior instructions to pair with those declarations.

## Safety Contract

- Read-only tools can run after the user grants access for the task.
- Live write tools require explicit user approval and `confirm=true`.
- Dry-run imports must be used before live import tasks.
- Do not put NewsMAN API keys, tokens, or passwords in prompts, declarations, logs, or source files.

## Official References

- Gemini function calling: `https://ai.google.dev/gemini-api/docs/function-calling`
- Gemini Interactions API tools: `https://ai.google.dev/gemini-api/docs/interactions`
