import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export const isWindows = process.platform === "win32";

export interface RunCliOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  signal?: AbortSignal;
  /** Text written to stdin, then stdin is closed. Used for prompts (avoids Windows arg-length and quoting limits). */
  stdin?: string;
  onLine?: (line: string) => void;
  onStderr?: (chunk: string) => void;
  /** Kill the process if no output arrives for this long. */
  idleTimeoutMs?: number;
}

export interface RunCliResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  killed: boolean;
  timedOut: boolean;
}

/** Common install locations that are often missing from Raycast's PATH. */
export function extraPathDirs(): string[] {
  const home = homedir();
  if (isWindows) {
    const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    const local = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    return [
      join(home, ".local", "bin"),
      join(appData, "npm"),
      join(local, "Programs", "claude"),
      join(local, "Microsoft", "WinGet", "Links"),
      join(home, "scoop", "shims"),
      join(home, ".volta", "bin"),
      join(home, ".bun", "bin"),
      join(home, ".cargo", "bin"),
      "C:\\Program Files\\nodejs",
    ];
  }
  return [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    join(home, ".local", "bin"),
    join(home, ".npm-global", "bin"),
    join(home, ".volta", "bin"),
    join(home, ".bun", "bin"),
    join(home, ".cargo", "bin"),
    "/usr/bin",
    "/bin",
  ];
}

export function spawnEnv(extra?: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...(extra ?? {}) };
  const current = env.PATH ?? env.Path ?? "";
  const merged = [...current.split(delimiter).filter(Boolean), ...extraPathDirs()];
  const dedup = Array.from(new Set(merged)).join(delimiter);
  env.PATH = dedup;
  if (isWindows) env.Path = dedup;
  // Never inherit interactive-only settings.
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  return env;
}

function needsShell(command: string): boolean {
  const lower = command.toLowerCase();
  return isWindows && (lower.endsWith(".cmd") || lower.endsWith(".bat"));
}

/** Quote a single argument for cmd.exe /s /c. Only used for flag-like args (prompts go through stdin). */
function cmdQuote(arg: string): string {
  if (/^[\w\-./\\:=,+]+$/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

/**
 * Spawn a CLI in the background (no terminal window), stream stdout line by line,
 * and honour an AbortSignal for cancellation.
 */
export function runCli(opts: RunCliOptions): Promise<RunCliResult> {
  return new Promise((resolve, reject) => {
    const env = spawnEnv(opts.env);
    let child;
    try {
      if (needsShell(opts.command)) {
        const line = [cmdQuote(opts.command), ...opts.args.map(cmdQuote)].join(" ");
        child = spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"${line}"`], {
          cwd: opts.cwd,
          env,
          windowsHide: true,
          windowsVerbatimArguments: true,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } else {
        child = spawn(opts.command, opts.args, {
          cwd: opts.cwd,
          env,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        });
      }
    } catch (e) {
      reject(e);
      return;
    }

    let stderr = "";
    let killed = false;
    let timedOut = false;
    let buffer = "";
    let idleTimer: NodeJS.Timeout | undefined;

    const resetIdle = () => {
      if (!opts.idleTimeoutMs) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        timedOut = true;
        kill();
      }, opts.idleTimeoutMs);
    };

    const kill = () => {
      if (killed) return;
      killed = true;
      try {
        if (isWindows && child.pid) {
          // Kill the whole tree so cmd.exe wrappers do not leave orphans.
          spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
        } else {
          child.kill("SIGTERM");
        }
      } catch {
        /* ignore */
      }
    };

    const onAbort = () => kill();
    if (opts.signal) {
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      resetIdle();
      buffer += chunk;
      let nl = buffer.indexOf("\n");
      while (nl >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (line.trim()) opts.onLine?.(line);
        nl = buffer.indexOf("\n");
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      resetIdle();
      stderr += chunk;
      if (stderr.length > 20000) stderr = stderr.slice(-20000);
      opts.onStderr?.(chunk);
    });
    child.on("error", (err) => {
      if (idleTimer) clearTimeout(idleTimer);
      opts.signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (code, signal) => {
      if (idleTimer) clearTimeout(idleTimer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (buffer.trim()) opts.onLine?.(buffer.replace(/\r$/, ""));
      resolve({ code, signal, stderr, killed, timedOut });
    });

    if (opts.stdin !== undefined) {
      child.stdin.on("error", () => {
        /* EPIPE when the process exits early */
      });
      child.stdin.end(opts.stdin, "utf8");
    } else {
      child.stdin.end();
    }
    resetIdle();
  });
}

/** Run a command and collect stdout (for --version style probes). */
export async function capture(
  command: string,
  args: string[],
  timeoutMs = 15000,
): Promise<{ out: string; code: number | null }> {
  let out = "";
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await runCli({ command, args, signal: controller.signal, onLine: (l) => (out += l + "\n") });
    return { out: out.trim(), code: r.code };
  } finally {
    clearTimeout(t);
  }
}
