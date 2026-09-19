import { prefs } from "./prefs";
import { ProviderError, runTurn } from "./providers";
import { automations as store } from "./storage";
import type { Automation, AutomationInterval, Conversation } from "./types";
import { errorMessage, uid } from "./util";

export const INTERVAL_MS: Record<AutomationInterval, number> = {
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "1w": 7 * 24 * 60 * 60_000,
};

export function isDue(a: Automation, now = Date.now()): boolean {
  if (!a.enabled) return false;
  if (!a.lastRunAt) return true;
  return now - a.lastRunAt >= INTERVAL_MS[a.interval];
}

/** Run one automation to completion (no streaming UI), store the result on the record. */
export async function runAutomation(a: Automation, timeoutMs = 10 * 60_000): Promise<Automation> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const conv: Conversation = {
    id: uid(),
    title: a.name,
    provider: a.provider ?? prefs().defaultProvider,
    model: a.model,
    agentId: a.agentId,
    cwd: a.cwd,
    permission: a.permission ?? "read",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: "automation",
  };
  let patch: Partial<Automation>;
  try {
    const r = await runTurn({ conversation: conv, prompt: a.prompt, signal: controller.signal, includeProfile: true });
    patch = { lastRunAt: Date.now(), lastResult: r.text, lastError: undefined, runCount: (a.runCount ?? 0) + 1 };
  } catch (e) {
    const msg = e instanceof ProviderError ? `${e.message}${e.hint ? ` — ${e.hint}` : ""}` : errorMessage(e);
    patch = { lastRunAt: Date.now(), lastError: msg, runCount: (a.runCount ?? 0) + 1 };
  } finally {
    clearTimeout(t);
  }
  return (await store.update(a.id, patch)) ?? { ...a, ...patch };
}
