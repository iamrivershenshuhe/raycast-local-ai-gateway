import { randomUUID } from "node:crypto";
import type { PermissionMode, ProviderId } from "./types";

export const uid = () => randomUUID();

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "anthropic-api": "Anthropic API",
  "openai-api": "OpenAI API",
};

export const PROVIDER_IDS: ProviderId[] = ["claude-code", "codex", "anthropic-api", "openai-api"];

export const PERMISSION_LABEL: Record<PermissionMode, string> = {
  ask: "Ask (no tools)",
  read: "Read (read-only)",
  agent: "Agent (edit files)",
  full: "Full Agent (run commands)",
};

export const PERMISSION_IDS: PermissionMode[] = ["ask", "read", "agent", "full"];

export function isCli(provider: ProviderId): boolean {
  return provider === "claude-code" || provider === "codex";
}

/** Who actually receives the data, for the privacy badge. */
export function vendorOf(provider: ProviderId): string {
  return provider === "claude-code" || provider === "anthropic-api" ? "Anthropic" : "OpenAI";
}

export function titleFrom(text: string, max = 60): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? line.slice(0, max - 1) + "…" : line || "Untitled";
}

export function relTime(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.round(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function fmtCost(usd?: number): string | undefined {
  if (usd === undefined || usd === null) return undefined;
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`;
}

export function fmtDuration(ms?: number): string | undefined {
  if (!ms) return undefined;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function fillTemplate(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{(\w[\w-]*)\}/g, (m, key: string) => {
    const v = vars[key];
    return v === undefined ? m : v;
  });
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : JSON.stringify(e);
}
