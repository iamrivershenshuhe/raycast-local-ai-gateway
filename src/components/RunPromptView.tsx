import {
  Action,
  ActionPanel,
  Clipboard,
  closeMainWindow,
  Detail,
  Icon,
  popToRoot,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { prefs } from "../lib/prefs";
import { ProviderError, runTurn } from "../lib/providers";
import { saveConversation } from "../lib/storage";
import type { CommandOutput, Conversation, ConversationSource, PermissionMode, ProviderId } from "../lib/types";
import { errorMessage, PROVIDER_LABEL, titleFrom, uid, vendorOf } from "../lib/util";

interface Props {
  title: string;
  prompt: string;
  output: CommandOutput;
  provider?: ProviderId;
  model?: string;
  agentId?: string;
  cwd?: string;
  permission?: PermissionMode;
  source: ConversationSource;
  includeProfile?: boolean;
}

/** One-shot streaming run used by AI Commands, Quick Fix and Quick AI style flows. */
export function RunPromptView(p: Props) {
  const [text, setText] = useState("");
  const [activity, setActivity] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const started = useRef(false);
  const provider = p.provider ?? prefs().defaultProvider;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const controller = new AbortController();
    abort.current = controller;
    const conv: Conversation = {
      id: uid(),
      title: titleFrom(p.title),
      provider,
      model: p.model,
      agentId: p.agentId,
      cwd: p.cwd,
      permission: p.permission ?? "ask",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: p.source,
    };
    let last = "";
    let timer: NodeJS.Timeout | undefined;
    const t0 = Date.now();
    (async () => {
      try {
        const res = await runTurn({
          conversation: conv,
          prompt: p.prompt,
          signal: controller.signal,
          includeProfile: p.includeProfile ?? false,
          onText: (full) => {
            last = full;
            if (!timer)
              timer = setTimeout(() => {
                setText(last);
                timer = undefined;
              }, 80);
          },
          onActivity: (l) => setActivity((a) => [...a.slice(-20), l]),
        });
        if (timer) clearTimeout(timer);
        setText(res.text);
        setDone(true);
        if (prefs().saveHistory && p.source !== "command") {
          await saveConversation({
            ...conv,
            providerSessionId: res.sessionId,
            messages: [
              { id: uid(), role: "user", content: p.prompt, createdAt: t0 },
              { id: uid(), role: "assistant", content: res.text, createdAt: Date.now(), meta: res.meta },
            ],
            updatedAt: Date.now(),
          });
        }
        if (p.output === "paste" || p.output === "replace") {
          await Clipboard.paste(res.text);
          await showHUD(p.output === "replace" ? "Replaced" : "Pasted");
          await popToRoot();
        } else if (p.output === "copy") {
          await Clipboard.copy(res.text);
          await showHUD("Copied to clipboard");
          await closeMainWindow();
          await popToRoot();
        }
      } catch (e) {
        if (timer) clearTimeout(timer);
        setText(last);
        setDone(true);
        const pe = e instanceof ProviderError ? e : undefined;
        if (pe?.kind === "cancelled") return;
        const msg = pe ? `${pe.message}${pe.hint ? `\n\n${pe.hint}` : ""}` : errorMessage(e);
        setError(msg);
        await showToast({ style: Toast.Style.Failure, title: pe?.message ?? "Request failed", message: pe?.hint });
      }
    })();
    return () => controller.abort();
  }, []);

  const badge = prefs().showProviderBadge
    ? `\n\n---\n_Sent to ${PROVIDER_LABEL[provider]} (${vendorOf(provider)})_`
    : "";
  const md = `${text || (done ? "" : "_Thinking…_")}${error ? `\n\n> ⚠️ ${error.replace(/\n/g, "\n> ")}` : ""}${
    activity.length && !done
      ? `\n\n---\n${activity
          .slice(-5)
          .map((a) => `- ${a}`)
          .join("\n")}`
      : ""
  }${badge}`;

  return (
    <Detail
      navigationTitle={p.title}
      isLoading={!done}
      markdown={md}
      actions={
        <ActionPanel>
          {text && <Action.CopyToClipboard title="Copy Result" content={text} />}
          {text && (
            <Action.Paste
              title="Paste Result"
              content={text}
              shortcut={{ modifiers: ["cmd", "shift"], key: "return" }}
            />
          )}
          {!done && (
            <Action
              title="Cancel"
              icon={Icon.Stop}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["cmd", "shift"], key: "x" }}
              onAction={() => abort.current?.abort()}
            />
          )}
          <Action.CopyToClipboard title="Copy Prompt" content={p.prompt} />
        </ActionPanel>
      }
    />
  );
}
