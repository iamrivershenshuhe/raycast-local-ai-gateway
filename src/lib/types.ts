export type ProviderId = "claude-code" | "codex" | "anthropic-api" | "openai-api";

/** ask = no tools, read = read-only, agent = may edit files, full = may run commands */
export type PermissionMode = "ask" | "read" | "agent" | "full";

export type Role = "user" | "assistant";

export interface MessageMeta {
  provider?: ProviderId;
  model?: string;
  costUsd?: number;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cwd?: string;
  permission?: PermissionMode;
  /** short activity log (tool calls / commands) for agent runs */
  activity?: string[];
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  meta?: MessageMeta;
  error?: string;
  cancelled?: boolean;
}

export type ConversationSource = "chat" | "quick" | "command" | "agent" | "automation";

export interface Conversation {
  id: string;
  title: string;
  provider: ProviderId;
  model?: string;
  agentId?: string;
  cwd?: string;
  permission?: PermissionMode;
  /** Claude Code session id / Codex thread id */
  providerSessionId?: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  archived?: boolean;
  folder?: string;
  source: ConversationSource;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  instructions: string;
  provider?: ProviderId;
  model?: string;
  permission?: PermissionMode;
  cwd?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  createdAt: number;
  lastUsedAt?: number;
}

export type CommandOutput = "view" | "paste" | "copy" | "replace";

export interface AICommand {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  /** Template. Placeholders: {selection} {clipboard} {input} {browser-tab is not supported} */
  prompt: string;
  provider?: ProviderId;
  model?: string;
  agentId?: string;
  output: CommandOutput;
  builtIn?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type AutomationInterval = "15m" | "1h" | "6h" | "1d" | "1w";

export interface Automation {
  id: string;
  name: string;
  prompt: string;
  provider?: ProviderId;
  model?: string;
  agentId?: string;
  cwd?: string;
  permission?: PermissionMode;
  interval: AutomationInterval;
  enabled: boolean;
  createdAt: number;
  lastRunAt?: number;
  lastResult?: string;
  lastError?: string;
  runCount?: number;
}

export interface DetectResult {
  installed: boolean;
  path?: string;
  version?: string;
  loggedIn?: boolean | "unknown";
  detail?: string;
  checkedAt: number;
}
