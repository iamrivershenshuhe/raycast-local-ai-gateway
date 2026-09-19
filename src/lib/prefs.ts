import { getPreferenceValues } from "@raycast/api";
import type { PermissionMode, ProviderId } from "./types";

export interface Prefs {
  defaultProvider: ProviderId;
  cliAuthMode: "cli-login" | "api-key";
  permissionMode: PermissionMode;
  claudeModel: string;
  codexModel: string;
  claudePath: string;
  codexPath: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  anthropicModel: string;
  openaiModel: string;
  saveHistory: boolean;
  historyScope: "separate" | "combined";
  startNewChatAfter: string;
  followUpBehavior: "queue" | "steer";
  autoArchiveDays: string;
  showProviderBadge: boolean;
  finishToast: boolean;
  warnDeleteChats: boolean;
  warnDeleteAgents: boolean;
  warnDeleteCommands: boolean;
  warnDeleteAutomations: boolean;
  maxContextChars: string;
}

let cached: Prefs | undefined;

export function prefs(): Prefs {
  if (!cached) cached = getPreferenceValues<Prefs>();
  return cached;
}

export function maxContextChars(): number {
  const n = parseInt(prefs().maxContextChars || "40000", 10);
  return Number.isFinite(n) && n > 500 ? n : 40000;
}

export function truncate(text: string, limit = maxContextChars()): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `\n\n[... truncated ${text.length - limit} characters ...]`;
}
