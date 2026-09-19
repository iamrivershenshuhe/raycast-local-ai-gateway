import { environment } from "@raycast/api";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectCli } from "../detect";
import { prefs } from "../prefs";
import { runCli } from "../process";
import { uid } from "../util";
import type { PermissionMode } from "../types";
import { classifyCliFailure, type Provider, ProviderError, type RunOptions, type RunResult } from "./base";

/** Map our four permission levels onto Claude Code flags. Never defaults to full access. */
function permissionArgs(mode: PermissionMode): string[] {
  switch (mode) {
    case "ask":
      return ["--tools", "", "--permission-mode", "dontAsk"];
    case "read":
      return ["--tools", "Read,Glob,Grep,WebFetch,WebSearch", "--permission-mode", "dontAsk"];
    case "agent":
      return [
        "--tools",
        "Read,Glob,Grep,WebFetch,WebSearch,Edit,Write,MultiEdit,NotebookEdit",
        "--permission-mode",
        "acceptEdits",
      ];
    case "full":
      return ["--dangerously-skip-permissions"];
  }
}

interface StreamLine {
  type?: string;
  subtype?: string;
  session_id?: string;
  event?: { type: string; delta?: { type: string; text?: string }; content_block?: { type: string; name?: string } };
  message?: { content?: Array<{ type: string; text?: string; name?: string; input?: unknown }> };
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  duration_ms?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: string;
  errors?: string[];
}

export const claudeCodeProvider: Provider = {
  id: "claude-code",
  name: "Claude Code",
  kind: "cli",
  defaultModel: () => prefs().claudeModel?.trim() || undefined,

  async run(o: RunOptions): Promise<RunResult> {
    const det = await detectCli("claude");
    if (!det.installed || !det.path) {
      throw new ProviderError(
        "not-installed",
        "Claude Code is not installed",
        "Install: npm i -g @anthropic-ai/claude-code",
      );
    }
    const p = prefs();
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--permission-prompts",
      "none",
      ...permissionArgs(o.permission),
    ];
    const model = o.model ?? this.defaultModel();
    if (model) args.push("--model", model);
    if (o.sessionId) args.push("--resume", o.sessionId);
    if (o.cwd) args.push("--add-dir", o.cwd);

    // System prompt goes through a temp file: no shell quoting, no arg-length limits.
    let sysFile: string | undefined;
    if (o.systemPrompt && !o.sessionId) {
      mkdirSync(environment.supportPath, { recursive: true });
      sysFile = join(environment.supportPath, `sys-${uid()}.md`);
      writeFileSync(sysFile, o.systemPrompt, "utf8");
      args.push("--append-system-prompt-file", sysFile);
    }

    const env: Record<string, string | undefined> = {};
    if (p.cliAuthMode === "api-key") {
      if (!p.anthropicApiKey)
        throw new ProviderError("no-api-key", "Anthropic API key not set", "Add it in the extension preferences.");
      env.ANTHROPIC_API_KEY = p.anthropicApiKey;
    }

    let text = "";
    let sessionId = o.sessionId;
    let resultText: string | undefined;
    let isError = false;
    let errorText = "";
    let costUsd: number | undefined;
    let durationMs: number | undefined;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let sawDelta = false;
    let blockOpen = false;

    const onLine = (line: string) => {
      let j: StreamLine;
      try {
        j = JSON.parse(line);
      } catch {
        return;
      }
      if (j.session_id) sessionId = j.session_id;
      switch (j.type) {
        case "stream_event": {
          const ev = j.event;
          if (!ev) break;
          if (ev.type === "content_block_start" && ev.content_block?.type === "text") {
            if (text && !text.endsWith("\n")) text += "\n\n";
            blockOpen = true;
          } else if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") {
            o.onActivity?.(`Tool: ${ev.content_block.name ?? "unknown"}`);
          } else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
            sawDelta = true;
            text += ev.delta.text;
            o.onText?.(text);
          } else if (ev.type === "content_block_stop") {
            blockOpen = false;
          }
          break;
        }
        case "assistant": {
          // Fallback when partial messages are unavailable.
          if (!sawDelta && j.message?.content) {
            for (const block of j.message.content) {
              if (block.type === "text" && block.text) {
                text += (text ? "\n\n" : "") + block.text;
                o.onText?.(text);
              } else if (block.type === "tool_use") {
                o.onActivity?.(`Tool: ${block.name ?? "unknown"}`);
              }
            }
          }
          break;
        }
        case "result": {
          resultText = j.result;
          isError = Boolean(j.is_error) || (j.subtype !== undefined && j.subtype !== "success");
          if (isError) errorText = j.result || (j.errors ?? []).join("\n") || j.subtype || "error";
          costUsd = j.total_cost_usd;
          durationMs = j.duration_ms;
          inputTokens = j.usage?.input_tokens;
          outputTokens = j.usage?.output_tokens;
          break;
        }
        case "system": {
          if (j.subtype === "status") o.onActivity?.("Thinking…");
          break;
        }
        default:
          break;
      }
    };

    let res;
    try {
      res = await runCli({
        command: det.path,
        args,
        cwd: o.cwd,
        env,
        stdin: o.prompt,
        signal: o.signal,
        onLine,
        idleTimeoutMs: 10 * 60 * 1000,
      });
    } finally {
      if (sysFile) {
        try {
          unlinkSync(sysFile);
        } catch {
          /* ignore */
        }
      }
    }
    void blockOpen;

    if (o.signal.aborted || (res.killed && !res.timedOut)) throw new ProviderError("cancelled", "Cancelled");
    if (res.timedOut) throw new ProviderError("timeout", "Claude Code produced no output for 10 minutes");
    if (!text && resultText && !isError) text = resultText;
    if (isError) {
      const lower = errorText.toLowerCase();
      if (/(login|auth|api key)/.test(lower)) {
        throw new ProviderError("not-logged-in", "Claude Code is not logged in", errorText);
      }
      if (/(limit|quota|overloaded)/.test(lower))
        throw new ProviderError("quota", "Claude usage limit reached", errorText);
      if (!text) throw new ProviderError("failed", errorText);
    }
    if (res.code !== 0 && !text) throw classifyCliFailure(res.stderr, res.code, "claude");

    return {
      text,
      sessionId,
      meta: {
        provider: "claude-code",
        model,
        costUsd,
        durationMs,
        inputTokens,
        outputTokens,
        cwd: o.cwd,
        permission: o.permission,
      },
    };
  },
};
