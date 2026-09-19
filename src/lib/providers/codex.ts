import { detectCli } from "../detect";
import { prefs } from "../prefs";
import { runCli } from "../process";
import type { PermissionMode } from "../types";
import { classifyCliFailure, type Provider, ProviderError, type RunOptions, type RunResult } from "./base";

/** Codex sandbox levels. `ask` has no tool-free mode, so it uses read-only plus an instruction. */
function sandboxFor(mode: PermissionMode): string {
  switch (mode) {
    case "ask":
    case "read":
      return "read-only";
    case "agent":
      return "workspace-write";
    case "full":
      return "danger-full-access";
  }
}

interface CodexItem {
  id?: string;
  type?: string;
  text?: string;
  command?: string;
  status?: string;
  exit_code?: number;
  message?: string;
  changes?: Array<{ path?: string; kind?: string }>;
}

interface CodexEvent {
  type?: string;
  thread_id?: string;
  item?: CodexItem;
  usage?: { input_tokens?: number; output_tokens?: number; cached_input_tokens?: number };
  error?: { message?: string } | string;
  message?: string;
}

export const codexProvider: Provider = {
  id: "codex",
  name: "Codex",
  kind: "cli",
  defaultModel: () => prefs().codexModel?.trim() || undefined,

  async run(o: RunOptions): Promise<RunResult> {
    const det = await detectCli("codex");
    if (!det.installed || !det.path) {
      throw new ProviderError("not-installed", "Codex CLI is not installed", "Install: npm i -g @openai/codex");
    }
    const p = prefs();
    const model = o.model ?? this.defaultModel();

    const common = ["--json", "--skip-git-repo-check", "--sandbox", sandboxFor(o.permission)];
    if (model) common.push("--model", model);
    if (o.cwd) common.push("--cd", o.cwd);

    const args = o.sessionId ? ["exec", "resume", ...common, o.sessionId, "-"] : ["exec", ...common, "-"];

    let prompt = o.prompt;
    if (o.permission === "ask") {
      prompt = `Answer directly from your knowledge. Do not read files or run commands.\n\n${prompt}`;
    }
    if (o.systemPrompt && !o.sessionId) {
      prompt = `<instructions>\n${o.systemPrompt}\n</instructions>\n\n${prompt}`;
    }

    const env: Record<string, string | undefined> = {};
    if (p.cliAuthMode === "api-key") {
      if (!p.openaiApiKey)
        throw new ProviderError("no-api-key", "OpenAI API key not set", "Add it in the extension preferences.");
      env.CODEX_API_KEY = p.openaiApiKey;
      env.OPENAI_API_KEY = p.openaiApiKey;
    }

    const messages = new Map<string, string>(); // agent_message id -> text (ordered by insertion)
    let sessionId = o.sessionId;
    let failure: string | undefined;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    const started = Date.now();

    const fullText = () => Array.from(messages.values()).join("\n\n");

    const onLine = (line: string) => {
      let ev: CodexEvent;
      try {
        ev = JSON.parse(line);
      } catch {
        return;
      }
      if (ev.thread_id) sessionId = ev.thread_id;
      switch (ev.type) {
        case "item.started":
        case "item.updated":
        case "item.completed": {
          const it = ev.item;
          if (!it) break;
          if (it.type === "agent_message" && typeof it.text === "string") {
            messages.set(it.id ?? String(messages.size), it.text);
            o.onText?.(fullText());
          } else if (it.type === "command_execution" && ev.type === "item.started") {
            o.onActivity?.(`Run: ${it.command ?? ""}`.trim());
          } else if (it.type === "file_change" && ev.type === "item.completed") {
            const files = (it.changes ?? []).map((c) => `${c.kind ?? "edit"} ${c.path ?? ""}`).join(", ");
            o.onActivity?.(`Files: ${files}`);
          } else if (it.type === "reasoning" && ev.type === "item.started") {
            o.onActivity?.("Thinking…");
          } else if (it.type === "error" && it.message) {
            failure = it.message;
          } else if (it.type === "web_search" && ev.type === "item.started") {
            o.onActivity?.("Web search");
          }
          break;
        }
        case "turn.completed":
          inputTokens = ev.usage?.input_tokens;
          outputTokens = ev.usage?.output_tokens;
          break;
        case "turn.failed":
        case "error": {
          const msg = typeof ev.error === "string" ? ev.error : (ev.error?.message ?? ev.message);
          if (msg) failure = msg;
          break;
        }
        default:
          break;
      }
    };

    const res = await runCli({
      command: det.path,
      args,
      cwd: o.cwd,
      env,
      stdin: prompt,
      signal: o.signal,
      onLine,
      idleTimeoutMs: 10 * 60 * 1000,
    });

    if (o.signal.aborted || (res.killed && !res.timedOut)) throw new ProviderError("cancelled", "Cancelled");
    if (res.timedOut) throw new ProviderError("timeout", "Codex produced no output for 10 minutes");
    const text = fullText();
    if (failure && !text) {
      const lower = failure.toLowerCase();
      if (/(login|auth|api key|unauthori)/.test(lower))
        throw new ProviderError("not-logged-in", "Codex is not logged in", failure);
      if (/(limit|quota|429)/.test(lower)) throw new ProviderError("quota", "Codex usage limit reached", failure);
      throw new ProviderError("failed", failure);
    }
    if (res.code !== 0 && !text) throw classifyCliFailure(res.stderr, res.code, "codex");

    return {
      text,
      sessionId,
      meta: {
        provider: "codex",
        model,
        durationMs: Date.now() - started,
        inputTokens,
        outputTokens,
        cwd: o.cwd,
        permission: o.permission,
      },
    };
  },
};
