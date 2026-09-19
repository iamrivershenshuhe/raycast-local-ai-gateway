import { showToast, Toast } from "@raycast/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { prefs } from "../lib/prefs";
import { ProviderError, runTurn } from "../lib/providers";
import { appendMemory, saveConversation, setText } from "../lib/storage";
import type { ChatMessage, Conversation, PermissionMode, ProviderId } from "../lib/types";
import { errorMessage, isCli, PROVIDER_LABEL, titleFrom, uid } from "../lib/util";

export interface UseChatOptions {
  /** Send this prompt as soon as the view mounts. */
  autoSend?: string;
  includeProfile?: boolean;
  /** LocalStorage key that remembers the last conversation id for "Start New Chat after N minutes". */
  rememberKey?: string;
}

const MEMORY_RE = /^\s*(remember|please remember|記住|記得|請記住)[\s:：,，]+(.+)/is;

export function useChat(initial: Conversation, options: UseChatOptions = {}) {
  const [conv, setConv] = useState<Conversation>(initial);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [activity, setActivity] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [pendingContext, setPendingContext] = useState<{ label: string; text: string } | undefined>();

  const convRef = useRef(conv);
  convRef.current = conv;
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const autoSent = useRef(false);
  const throttleRef = useRef<{ t?: NodeJS.Timeout; text: string }>({ text: "" });

  const persist = useCallback(
    async (c: Conversation) => {
      if (!prefs().saveHistory) return;
      await saveConversation(c);
      if (options.rememberKey) await setText(options.rememberKey, c.id);
    },
    [options.rememberKey],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runPrompt = useCallback(
    async (rawPrompt: string) => {
      const text = rawPrompt.trim();
      if (!text) return;
      runningRef.current = true;
      setRunning(true);
      setActivity([]);
      setStreaming("");

      let prompt = text;
      const ctx = pendingContext;
      if (ctx) {
        prompt = `${text}\n\n<${ctx.label}>\n${ctx.text}\n</${ctx.label}>`;
        setPendingContext(undefined);
      }
      const memMatch = MEMORY_RE.exec(text);
      if (memMatch?.[2]) {
        await appendMemory(memMatch[2].trim());
      }

      const userMsg: ChatMessage = { id: uid(), role: "user", content: prompt, createdAt: Date.now() };
      const base = convRef.current;
      const withUser: Conversation = {
        ...base,
        title: base.messages.length === 0 ? titleFrom(text) : base.title,
        messages: [...base.messages, userMsg],
        updatedAt: Date.now(),
      };
      setConv(withUser);
      convRef.current = withUser;

      const controller = new AbortController();
      abortRef.current = controller;
      const started = Date.now();
      const activityLog: string[] = [];

      const flush = () => {
        setStreaming(throttleRef.current.text);
        throttleRef.current.t = undefined;
      };

      let assistant: ChatMessage;
      try {
        const result = await runTurn({
          conversation: withUser,
          prompt,
          signal: controller.signal,
          includeProfile: options.includeProfile ?? true,
          onText: (full) => {
            throttleRef.current.text = full;
            if (!throttleRef.current.t) throttleRef.current.t = setTimeout(flush, 80);
          },
          onActivity: (line) => {
            activityLog.push(line);
            if (activityLog.length > 50) activityLog.shift();
            setActivity([...activityLog]);
          },
        });
        assistant = {
          id: uid(),
          role: "assistant",
          content: result.text || "(no text in response)",
          createdAt: Date.now(),
          meta: { ...result.meta, activity: activityLog.length ? [...activityLog] : undefined },
        };
        const next: Conversation = {
          ...convRef.current,
          providerSessionId: result.sessionId ?? convRef.current.providerSessionId,
          messages: [...convRef.current.messages, assistant],
          updatedAt: Date.now(),
        };
        setConv(next);
        convRef.current = next;
        await persist(next);
        if (prefs().finishToast) {
          await showToast({
            style: Toast.Style.Success,
            title: `${PROVIDER_LABEL[result.meta.provider ?? withUser.provider]} answered`,
            message: `${((Date.now() - started) / 1000).toFixed(1)}s`,
          });
        }
      } catch (e) {
        const partial = throttleRef.current.text;
        const pe = e instanceof ProviderError ? e : undefined;
        const cancelled = pe?.kind === "cancelled" || controller.signal.aborted;
        assistant = {
          id: uid(),
          role: "assistant",
          content: partial,
          createdAt: Date.now(),
          cancelled,
          error: cancelled ? undefined : pe ? `${pe.message}${pe.hint ? `\n\n${pe.hint}` : ""}` : errorMessage(e),
          meta: { provider: withUser.provider, activity: activityLog.length ? [...activityLog] : undefined },
        };
        const next: Conversation = {
          ...convRef.current,
          messages: [...convRef.current.messages, assistant],
          updatedAt: Date.now(),
        };
        setConv(next);
        convRef.current = next;
        await persist(next);
        if (!cancelled) {
          await showToast({ style: Toast.Style.Failure, title: pe?.message ?? "Request failed", message: pe?.hint });
        }
      } finally {
        if (throttleRef.current.t) clearTimeout(throttleRef.current.t);
        throttleRef.current = { text: "" };
        setStreaming(null);
        abortRef.current = null;
        runningRef.current = false;
        setRunning(false);
        const nextQueued = queueRef.current.shift();
        setQueue([...queueRef.current]);
        if (nextQueued) void runPrompt(nextQueued);
      }
    },
    [pendingContext, options.includeProfile, persist],
  );

  const send = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      if (runningRef.current) {
        if (prefs().followUpBehavior === "steer") {
          cancel();
          queueRef.current.unshift(text);
        } else {
          queueRef.current.push(text);
        }
        setQueue([...queueRef.current]);
        return;
      }
      void runPrompt(text);
    },
    [cancel, runPrompt],
  );

  const update = useCallback((patch: Partial<Conversation>) => {
    const next = { ...convRef.current, ...patch, updatedAt: Date.now() };
    convRef.current = next;
    setConv(next);
  }, []);

  const setProvider = useCallback(
    (provider: ProviderId) => {
      if (provider === convRef.current.provider) return;
      // A provider session cannot be carried across providers.
      update({ provider, providerSessionId: undefined, model: undefined });
    },
    [update],
  );

  const setPermission = useCallback((permission: PermissionMode) => update({ permission }), [update]);
  const setCwd = useCallback((cwd?: string) => update({ cwd }), [update]);
  const setModel = useCallback((model?: string) => update({ model: model?.trim() || undefined }), [update]);
  const setAgent = useCallback((agentId?: string) => update({ agentId }), [update]);

  const newChat = useCallback(() => {
    cancel();
    queueRef.current = [];
    setQueue([]);
    const c = convRef.current;
    const fresh: Conversation = {
      id: uid(),
      title: "New chat",
      provider: c.provider,
      model: c.model,
      agentId: c.agentId,
      cwd: c.cwd,
      permission: c.permission,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: c.source,
    };
    convRef.current = fresh;
    setConv(fresh);
    setStreaming(null);
    setActivity([]);
  }, [cancel]);

  useEffect(() => {
    if (options.autoSend && !autoSent.current) {
      autoSent.current = true;
      send(options.autoSend);
    }
    return () => abortRef.current?.abort();
  }, []);

  return {
    conv,
    streaming,
    activity,
    running,
    queue,
    pendingContext,
    setPendingContext,
    send,
    cancel,
    newChat,
    update,
    setProvider,
    setPermission,
    setCwd,
    setModel,
    setAgent,
    usesCli: isCli(conv.provider),
  };
}
