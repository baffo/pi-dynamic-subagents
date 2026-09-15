# pi-dynamic-subagents

A [Pi](https://pi.dev) package that provides the `subagent` tool with ordered, per-agent fallback models and ready-to-use worker and reviewer profiles.

It is a drop-in replacement for the standalone subagent extension: use **one or the other**, never both.

## Acknowledgements

This project is based on [nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents).

## Install

```bash
pi install npm:pi-dynamic-subagents
```

For local development:

```bash
pi install /absolute/path/to/pi-dynamic-subagents
```

Remove or disable any existing extension that registers a `subagent` tool before restarting Pi. Pi does not offer an API for one extension to wrap another extension's tool implementation.

The package includes these agents automatically:

- `worker` — complex implementation work
- `worker-fast` — small, well-defined implementation work
- `reviewer` — broad, architecture-aware reviews (read-only)
- `reviewer-fast` — localized reviews (read-only)

User agents in `~/.pi/agent/agents/` and trusted project agents in `.pi/agents/` can override an included agent with the same name.

## Configure agents

Put agent definitions in `~/.pi/agent/agents/*.md` or in a trusted project’s `.pi/agents/*.md`.

```md
---
name: worker
description: Complex implementation worker
model: claude-bridge/claude-opus-4-8
fallbackModels:
  - openai-codex/gpt-5.6-terra
  - openai-codex/gpt-5.6-sol
---

You are a deep implementation worker.
```

`fallbackModels` may also be a comma-separated string. Entries must use `provider/model-id` format. Models run in declaration order and duplicates are ignored.

### Eligible failures

By default the next model is used only after the primary Pi process ends with one of these terminal failures:

- `model_unavailable` — missing or unavailable model, or unavailable model authentication
- `usage_limit` — quota, credit, or provider usage-limit exhaustion

Rate limiting is deliberately excluded by default because Pi’s normal retry/backoff policy should handle transient 429 responses. To treat a terminal 429 as a fallback condition, opt in per agent:

```yaml
fallbackOn: [model_unavailable, usage_limit, rate_limit]
```

Unknown errors, tool failures, context overflow, and cancellation never trigger a fallback.

## Execution behavior

Each subagent invocation gets a private, temporary Pi session. On an eligible terminal failure, the extension starts the next fallback model in RPC mode, compacts that session with a handoff-focused summary, then starts a fresh Pi process on the same compacted session. The fallback therefore receives the task, completed work, tool results, decisions, and next steps without replaying the full context.

The original system prompt is used for both compaction and the fallback. The fallback receives an explicit continuation instruction and is told not to repeat completed work. Filesystem changes from the interrupted attempt remain in the working directory too.

If compaction fails, the fallback is not started: preserving the handoff is required rather than best-effort. A "Nothing to compact" response is safe to continue from because the complete session is already small. The private session directory is removed after the subagent completes, including when all fallback models fail. The tool result records attempted models and their classified failures.

## Development

```bash
npm install
npm run check
npm test
npm run pack:check
```

Before publishing, choose an available npm name (or an npm scope), update `package.json` with its repository and author metadata, then run:

```bash
npm publish
```

The `pi-package` keyword and `pi.extensions` manifest make the package discoverable by Pi’s package loader and gallery.

## Compatibility

Requires Node.js 22+ and Pi’s extension runtime. Pi-provided packages are declared as peer dependencies and are not bundled.

## License

MIT
