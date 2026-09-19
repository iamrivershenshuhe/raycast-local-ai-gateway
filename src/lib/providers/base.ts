import type { ChatMessage, MessageMeta, PermissionMode, ProviderId } from "../types";

export type ProviderErrorKind =
  "not-installed" | "not-logged-in" | "no-api-key" | "quota" | "timeout" | "cancelled" | "failed";

export class ProviderError extends Error {
  constructor(
    public kind: ProviderErrorKind,
    message: string,
    public hint?: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface RunOptions {
  prompt: string;
  /** Profile + memory + agent instructions. */
  systemPrompt?: string;
  model?: string;
  cwd?: string;
  permission: PermissionMode;
  /** Provider session to resume (Claude Code session id / Codex thread id). */
  sessionId?: string;
  /** Prior turns, used by API providers (CLI providers rely on sessionId). */
  history?: ChatMessage[];
  signal: AbortSignal;
  /** Called with the accumulated answer text so far. */
  onText?: (fullText: string) => void;
  /** Tool calls / commands / status lines for the activity log. */
  onActivity?: (line: string) => void;
}

export interface RunResult {
  text: string;
  sessionId?: string;
  meta: MessageMeta;
}

export interface Provider {
  id: ProviderId;
  name: string;
  kind: "cli" | "api";
  /** Model used when none is specified for the conversation. */
  defaultModel(): string | undefined;
  run(opts: RunOptions): Promise<RunResult>;
}

/** Classify common CLI failure text into a ProviderError. */
export function classifyCliFailure(stderr: string, code: number | null, tool: string): ProviderError {
  const s = stderr.toLowerCase();
  if (/(not logged in|please (run )?\/?login|login required|unauthori[sz]ed|invalid api key|authentication)/.test(s)) {
    return new ProviderError("not-logged-in", `${tool} is not logged in`, `Run \`${tool}\` in a terminal and sign in.`);
  }
  if (/(rate limit|usage limit|quota|too many requests|429|overloaded)/.test(s)) {
    return new ProviderError(
      "quota",
      `${tool} hit a usage or rate limit`,
      stderr.trim().split("\n").slice(-3).join("\n"),
    );
  }
  const tail = stderr.trim().split("\n").filter(Boolean).slice(-6).join("\n");
  return new ProviderError("failed", `${tool} exited with code ${code ?? "?"}`, tail || undefined);
}
