import { prefs } from "../prefs";
import { agents as agentStore, getText, KEY_MEMORY, KEY_PROFILE } from "../storage";
import type { Agent, Conversation, ProviderId } from "../types";
import { anthropicApiProvider } from "./anthropic-api";
import type { Provider, RunResult } from "./base";
import { claudeCodeProvider } from "./claude-code";
import { codexProvider } from "./codex";
import { openaiApiProvider } from "./openai-api";

export * from "./base";

const registry: Record<ProviderId, Provider> = {
  "claude-code": claudeCodeProvider,
  codex: codexProvider,
  "anthropic-api": anthropicApiProvider,
  "openai-api": openaiApiProvider,
};

export function getProvider(id: ProviderId): Provider {
  return registry[id] ?? registry[prefs().defaultProvider] ?? claudeCodeProvider;
}

/** Profile (optional) + memory + agent instructions, in that order. */
export async function buildSystemPrompt(opts: { agent?: Agent; includeProfile: boolean }): Promise<string | undefined> {
  const parts: string[] = [];
  if (opts.includeProfile) {
    const profile = (await getText(KEY_PROFILE)).trim();
    if (profile) parts.push(`# About the user\n${profile}`);
  }
  const memory = (await getText(KEY_MEMORY)).trim();
  if (memory) {
    parts.push(
      `# Memory (facts the user asked you to remember)\n${memory}\n\nIf the user asks you to remember something new, acknowledge it briefly; the host application stores it.`,
    );
  }
  if (opts.agent?.instructions?.trim()) parts.push(`# Agent instructions\n${opts.agent.instructions.trim()}`);
  return parts.length ? parts.join("\n\n") : undefined;
}

export interface TurnInput {
  conversation: Conversation;
  prompt: string;
  signal: AbortSignal;
  includeProfile: boolean;
  onText?: (fullText: string) => void;
  onActivity?: (line: string) => void;
}

/** Run one turn of a conversation against its provider, resolving agent, model, cwd and permissions. */
export async function runTurn(input: TurnInput): Promise<RunResult> {
  const c = input.conversation;
  const provider = getProvider(c.provider);
  const agent = c.agentId ? await agentStore.get(c.agentId) : undefined;
  const systemPrompt = await buildSystemPrompt({ agent, includeProfile: input.includeProfile });
  const permission = c.permission ?? agent?.permission ?? prefs().permissionMode;
  const model = c.model ?? agent?.model ?? provider.defaultModel();
  const cwd = c.cwd ?? agent?.cwd;
  return provider.run({
    prompt: input.prompt,
    systemPrompt,
    model,
    cwd,
    permission,
    sessionId: c.providerSessionId,
    history: provider.kind === "api" ? c.messages : undefined,
    signal: input.signal,
    onText: input.onText,
    onActivity: input.onActivity,
  });
}
