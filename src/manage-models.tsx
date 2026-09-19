import { Action, ActionPanel, Color, Icon, List, openExtensionPreferences, showToast, Toast } from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { clearDetectCache, detectCli } from "./lib/detect";
import { prefs } from "./lib/prefs";
import { getProvider, ProviderError } from "./lib/providers";
import type { DetectResult, ProviderId } from "./lib/types";
import { PROVIDER_LABEL, vendorOf } from "./lib/util";

interface Row {
  id: ProviderId;
  status: "ok" | "warn" | "error" | "unknown";
  lines: string[];
  detail?: DetectResult;
}

export default function ManageModels() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    if (force) clearDetectCache();
    const p = prefs();
    const [claude, codex] = await Promise.all([detectCli("claude", force), detectCli("codex", force)]);
    const cliRow = (id: ProviderId, d: DetectResult, model: string, keyPresent: boolean): Row => {
      const lines: string[] = [];
      let status: Row["status"] = "ok";
      if (!d.installed) {
        status = "error";
        lines.push("✗ Not installed", d.detail ?? "");
      } else {
        lines.push(`✓ Installed ${d.version ? `(${d.version})` : ""}`.trim(), `Path: ${d.path}`);
        if (p.cliAuthMode === "api-key") {
          lines.push(
            keyPresent
              ? "✓ API key from preferences will be injected"
              : "✗ CLI Authentication is API Key but no key is set",
          );
          if (!keyPresent) status = "warn";
        } else if (d.loggedIn === true) lines.push(`✓ Logged in${d.detail ? ` (${d.detail})` : ""}`);
        else if (d.loggedIn === false) {
          status = "warn";
          lines.push(`✗ Not logged in. ${d.detail ?? ""}`);
        } else lines.push("? Login state unknown");
      }
      lines.push(`Model: ${model || "CLI default"}`);
      return { id, status, lines: lines.filter(Boolean), detail: d };
    };
    const apiRow = (id: ProviderId, key: string | undefined, model: string): Row => ({
      id,
      status: key ? "ok" : "unknown",
      lines: [
        key ? "✓ API key configured (stored encrypted by Raycast)" : "Not configured. Add an API key in preferences.",
        `Model: ${model}`,
      ],
    });
    setRows([
      cliRow("claude-code", claude, p.claudeModel, Boolean(p.anthropicApiKey)),
      cliRow("codex", codex, p.codexModel, Boolean(p.openaiApiKey)),
      apiRow("anthropic-api", p.anthropicApiKey, p.anthropicModel),
      apiRow("openai-api", p.openaiApiKey, p.openaiModel),
    ]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const test = async (id: ProviderId) => {
    const toast = await showToast({ style: Toast.Style.Animated, title: `Testing ${PROVIDER_LABEL[id]}…` });
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 90_000);
    const started = Date.now();
    try {
      const r = await getProvider(id).run({
        prompt: "Reply with exactly: OK",
        permission: "ask",
        signal: controller.signal,
      });
      toast.style = Toast.Style.Success;
      toast.title = `${PROVIDER_LABEL[id]} works`;
      toast.message = `${r.text.trim().slice(0, 40)} · ${((Date.now() - started) / 1000).toFixed(1)}s`;
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = e instanceof ProviderError ? e.message : "Test failed";
      toast.message = e instanceof ProviderError ? e.hint : (e as Error).message;
    } finally {
      clearTimeout(t);
    }
  };

  const icon = (s: Row["status"]) =>
    s === "ok"
      ? { source: Icon.CheckCircle, tintColor: Color.Green }
      : s === "warn"
        ? { source: Icon.Warning, tintColor: Color.Yellow }
        : s === "error"
          ? { source: Icon.XMarkCircle, tintColor: Color.Red }
          : { source: Icon.Circle, tintColor: Color.SecondaryText };

  const p = prefs();
  return (
    <List isLoading={loading} isShowingDetail navigationTitle="Models & Providers">
      <List.Section title="Providers" subtitle={`default: ${PROVIDER_LABEL[p.defaultProvider]}`}>
        {rows.map((r) => (
          <List.Item
            key={r.id}
            title={PROVIDER_LABEL[r.id]}
            subtitle={r.id === p.defaultProvider ? "default" : undefined}
            icon={icon(r.status)}
            accessories={[{ tag: { value: vendorOf(r.id), color: Color.Blue } }]}
            detail={
              <List.Item.Detail
                markdown={`# ${PROVIDER_LABEL[r.id]}\n\n${r.lines.map((l) => `- ${l}`).join("\n")}\n\n${
                  r.id === "claude-code"
                    ? "Runs `claude -p --output-format stream-json` in the background. Uses your Claude subscription when logged in."
                    : r.id === "codex"
                      ? "Runs `codex exec --json` in the background. Uses your ChatGPT/Codex login when signed in."
                      : "Direct HTTPS calls with your API key. Billed per token."
                }\n\nData is sent to **${vendorOf(r.id)}**.`}
              />
            }
            actions={
              <ActionPanel>
                <Action title="Test Provider" icon={Icon.Bolt} onAction={() => test(r.id)} />
                <Action
                  title="Re-Detect"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={() => load(true)}
                />
                {r.detail?.path && <Action.CopyToClipboard title="Copy Executable Path" content={r.detail.path} />}
                <Action
                  title="Open Extension Preferences"
                  icon={Icon.Gear}
                  shortcut={{ modifiers: ["cmd"], key: "," }}
                  onAction={openExtensionPreferences}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section title="Settings">
        <List.Item
          title="Permission Mode"
          icon={Icon.Lock}
          accessories={[{ text: p.permissionMode }]}
          detail={
            <List.Item.Detail
              markdown={`# Permission Mode\n\nDefault: **${p.permissionMode}**\n\n| Mode | Claude Code | Codex |\n|---|---|---|\n| ask | \`--tools ""\` | read-only sandbox + instruction |\n| read | Read/Glob/Grep/Web tools | read-only sandbox |\n| agent | + Edit/Write, acceptEdits | workspace-write |\n| full | --dangerously-skip-permissions | danger-full-access |\n\nAll prompts are non-interactive (\`--permission-prompts none\`): anything that would ask is denied instead of hanging.`}
            />
          }
          actions={
            <ActionPanel>
              <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
            </ActionPanel>
          }
        />
        <List.Item
          title="CLI Authentication"
          icon={Icon.Key}
          accessories={[{ text: p.cliAuthMode }]}
          detail={
            <List.Item.Detail
              markdown={`# CLI Authentication\n\n**${p.cliAuthMode}**\n\n- \`cli-login\`: the CLI uses whatever account you signed into in the terminal (subscription quota).\n- \`api-key\`: the key from preferences is injected as \`ANTHROPIC_API_KEY\` / \`CODEX_API_KEY\` for that process only.\n\nKeys are stored by Raycast's encrypted password preferences, never written to disk by this extension.`}
            />
          }
          actions={
            <ActionPanel>
              <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
