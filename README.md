# Local AI Gateway for Raycast

Use **Claude Code** and **Codex CLI** from Raycast with the login and plan quota you already have in your terminal.
Optionally talk to the **Anthropic** or **OpenAI** API directly with a key stored in Raycast's encrypted preferences.

No terminal window is opened and no terminal output is scraped: the CLIs are spawned in the background in their
structured non-interactive modes (`claude -p --output-format stream-json`, `codex exec --json`) and every event is
turned into streaming UI.

```
Raycast UI (List / Detail / Form)
        │
        ▼
AI Provider Abstraction  (src/lib/providers)
        ├── ClaudeCodeProvider   claude -p --output-format stream-json --include-partial-messages
        ├── CodexProvider        codex exec --json  (sandbox: read-only | workspace-write | danger-full-access)
        ├── AnthropicApiProvider @anthropic-ai/sdk  messages.stream
        └── OpenAiApiProvider    openai  chat.completions (stream)
```

## Commands

| Command | What it does |
|---|---|
| **Ask AI** | Streaming multi-turn chat. Provider dropdown, ⌘P provider, ⌘⇧P permission, ⌘D project, ⌘⇧A agent, ⌘M model, ⌘⇧S / ⌘⇧V attach selection / clipboard, ⌘⇧X cancel, ⌘N new chat, ⌘H history. Resumes the last chat inside the "Start New Chat" window. |
| **Quick AI** | One-shot question from the root search, answered in the same chat UI. Filed separately in history. |
| **Ask Selected Text / Ask Clipboard** | Same chat with the selection / clipboard attached as context. |
| **Quick Fix** | Fixes grammar or code in the selection and pastes the result back. |
| **Chat History** | Pinned / folders / per-source or per-provider sections, archive, rename, delete, auto-archive. |
| **Manage Models & Providers** | Detects Claude Code and Codex, shows path, version, login state, lets you test each provider. |
| **Search Agents / Create Agent / Import Agents** | Agents = instructions + provider + model + permission mode + project. |
| **Projects** | Working directories the CLI agents can read (and edit with permission). "Ask AI in This Project". |
| **Search AI Commands / Create AI Command / Import AI Commands** | Prompt templates with `{selection}`, `{clipboard}`, `{input}`. 8 built-ins (Explain, Fix Grammar, Improve, Summarize, Translate, Explain Code, Fix Code, Change Tone). Output: show / paste / replace / copy. |
| **Profile** | Context added to every conversation except AI Commands. |
| **Show Memory / Import Memory** | Say "Remember …" in any chat, or "Remember This Answer". Editable, importable, clearable. |
| **Manage Automations / Create Automation / Run Due Automations** | Prompts on a schedule (15m · 1h · 6h · 1d · 1w), run by a background command every 15 minutes while Raycast is open. Latest result kept per automation. |

## Permission modes (safe by default: **Read**)

| Mode | Claude Code | Codex |
|---|---|---|
| Ask | `--tools ""` | `--sandbox read-only` + "answer directly" |
| Read | `--tools Read,Glob,Grep,WebFetch,WebSearch` | `--sandbox read-only` |
| Agent | `+ Edit,Write,MultiEdit --permission-mode acceptEdits` | `--sandbox workspace-write` |
| Full Agent | `--dangerously-skip-permissions` | `--sandbox danger-full-access` |

All runs use `--permission-prompts none`: anything that would ask for approval is denied instead of hanging.

## Authentication

- **Use existing CLI login** (default): the CLI is spawned as-is and uses your Claude / ChatGPT account.
- **API Key**: the key from preferences is injected as `ANTHROPIC_API_KEY` / `CODEX_API_KEY` into that process only.
- Keys live in Raycast `password` preferences (encrypted). Nothing is written to a config file by this extension.
- Every answer shows a **Sent to** badge (Anthropic / OpenAI) so it is always clear where the request went.

## Resource use

- Nothing runs until you ask. No polling, no daemons; the automation runner does one LocalStorage read when nothing is due.
- CLI detection is cached for 10 minutes; results are cached with Raycast `Cache`.
- One CLI process per request, killed (with its tree) on cancel, Esc, or view close. Idle timeout 10 minutes.
- UI re-renders are throttled to ~12 fps while streaming.
- Prompts are passed over **stdin** (not argv) so long context never hits Windows' 8 KB argument limit or shell quoting.

## Development

```bash
npm install
npm run dev        # ray develop
npm run build      # ray build -e dist
npm run lint
```

Works on macOS and Windows (Raycast for Windows). Auto-detects `claude` / `codex` in the usual locations
(`/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`, `~/.npm-global/bin`, `%APPDATA%\npm`, …) and falls back to
`which` / `where`. Override the executable paths in preferences if needed.

## Error states

Distinguished and surfaced separately: CLI not installed, not logged in, missing API key, quota / rate limit,
timeout, cancelled, and generic failure (with the last lines of stderr).
