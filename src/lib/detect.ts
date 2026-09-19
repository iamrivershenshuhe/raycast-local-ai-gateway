import { Cache } from "@raycast/api";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { capture, extraPathDirs, isWindows } from "./process";
import { prefs } from "./prefs";
import type { DetectResult } from "./types";

export type CliTool = "claude" | "codex";

const cache = new Cache({ namespace: "cli-detect" });
const TTL_MS = 10 * 60 * 1000;

function candidates(tool: CliTool): string[] {
  const names = isWindows ? [`${tool}.exe`, `${tool}.cmd`, tool] : [tool];
  const dirs = extraPathDirs();
  const list: string[] = [];
  for (const d of dirs) for (const n of names) list.push(join(d, n));
  return list;
}

function isExecutable(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isFile();
  } catch {
    return false;
  }
}

async function whichLookup(tool: CliTool): Promise<string | undefined> {
  try {
    if (isWindows) {
      const { out } = await capture("where.exe", [tool], 5000);
      const first =
        out
          .split("\n")
          .map((l) => l.trim())
          .find((l) => /\.(exe|cmd|bat)$/i.test(l)) ?? out.split("\n")[0]?.trim();
      return first || undefined;
    }
    // Use a login shell so nvm/volta/homebrew shims resolve like in Terminal.
    const shell = process.env.SHELL || "/bin/zsh";
    const { out } = await capture(shell, ["-lic", `command -v ${tool}`], 8000);
    const line = out
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("/"));
    return line || undefined;
  } catch {
    return undefined;
  }
}

/** Resolve the executable path: preference override → cache → candidates → which/where. */
export async function resolveCliPath(tool: CliTool, force = false): Promise<string | undefined> {
  const override = tool === "claude" ? prefs().claudePath : prefs().codexPath;
  if (override?.trim()) return override.trim();
  if (!force) {
    const cached = cache.get(`path:${tool}`);
    if (cached && isExecutable(cached)) return cached;
  }
  for (const c of candidates(tool)) {
    if (isExecutable(c)) {
      cache.set(`path:${tool}`, c);
      return c;
    }
  }
  const found = await whichLookup(tool);
  if (found && isExecutable(found)) {
    cache.set(`path:${tool}`, found);
    return found;
  }
  return undefined;
}

function loginState(tool: CliTool): { loggedIn: boolean | "unknown"; detail?: string } {
  const home = homedir();
  try {
    if (tool === "claude") {
      const cfg = join(home, ".claude.json");
      if (existsSync(cfg)) {
        const json = JSON.parse(readFileSync(cfg, "utf8"));
        if (json?.oauthAccount?.emailAddress) {
          return { loggedIn: true, detail: `${json.oauthAccount.emailAddress}` };
        }
      }
      if (existsSync(join(home, ".claude", ".credentials.json"))) return { loggedIn: true, detail: "credentials file" };
      if (process.env.ANTHROPIC_API_KEY) return { loggedIn: true, detail: "ANTHROPIC_API_KEY in environment" };
      return { loggedIn: false, detail: "Run `claude` in a terminal and sign in" };
    }
    const auth = join(home, ".codex", "auth.json");
    if (existsSync(auth)) {
      const json = JSON.parse(readFileSync(auth, "utf8"));
      if (json?.OPENAI_API_KEY) return { loggedIn: true, detail: "API key auth" };
      if (json?.tokens) return { loggedIn: true, detail: "ChatGPT login" };
      return { loggedIn: true, detail: "auth.json present" };
    }
    if (process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY)
      return { loggedIn: true, detail: "API key in environment" };
    return { loggedIn: false, detail: "Run `codex` in a terminal and sign in" };
  } catch {
    return { loggedIn: "unknown" };
  }
}

export async function detectCli(tool: CliTool, force = false): Promise<DetectResult> {
  if (!force) {
    const raw = cache.get(`detect:${tool}`);
    if (raw) {
      const parsed = JSON.parse(raw) as DetectResult;
      if (Date.now() - parsed.checkedAt < TTL_MS && (!parsed.path || isExecutable(parsed.path))) return parsed;
    }
  }
  const path = await resolveCliPath(tool, force);
  let result: DetectResult;
  if (!path) {
    result = { installed: false, checkedAt: Date.now(), detail: "Not found. Set the executable path in preferences." };
  } else {
    let version: string | undefined;
    try {
      const { out } = await capture(path, ["--version"], 20000);
      version = out.split("\n")[0]?.trim();
    } catch (e) {
      version = undefined;
      result = { installed: false, path, checkedAt: Date.now(), detail: `Failed to run: ${(e as Error).message}` };
      cache.set(`detect:${tool}`, JSON.stringify(result));
      return result;
    }
    const login = loginState(tool);
    result = { installed: true, path, version, loggedIn: login.loggedIn, detail: login.detail, checkedAt: Date.now() };
  }
  cache.set(`detect:${tool}`, JSON.stringify(result));
  return result;
}

export function clearDetectCache(): void {
  cache.clear();
}
