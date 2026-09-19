import { LaunchProps, List } from "@raycast/api";
import { useEffect, useState } from "react";
import { ChatView } from "./components/ChatView";
import { prefs } from "./lib/prefs";
import { conversations, getText, KEY_LAST_CHAT } from "./lib/storage";
import type { Conversation } from "./lib/types";
import { uid } from "./lib/util";

export interface AskLaunchContext {
  conversationId?: string;
  cwd?: string;
  agentId?: string;
  prompt?: string;
  provider?: Conversation["provider"];
}

type Props = LaunchProps<{ arguments: { prompt?: string }; launchContext?: AskLaunchContext }>;

export function freshConversation(partial: Partial<Conversation> = {}): Conversation {
  return {
    id: uid(),
    title: "New chat",
    provider: prefs().defaultProvider,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: "chat",
    ...partial,
  };
}

/** Reopen the last chat if it was touched within the "Start New Chat" window. */
async function pickConversation(ctx?: AskLaunchContext): Promise<Conversation> {
  if (ctx?.conversationId) {
    const c = await conversations.get(ctx.conversationId);
    if (c) return c;
  }
  const overrides: Partial<Conversation> = {};
  if (ctx?.cwd) overrides.cwd = ctx.cwd;
  if (ctx?.agentId) overrides.agentId = ctx.agentId;
  if (ctx?.provider) overrides.provider = ctx.provider;
  if (Object.keys(overrides).length) return freshConversation(overrides);

  const minutes = parseInt(prefs().startNewChatAfter || "5", 10);
  if (minutes === 0 || !prefs().saveHistory) return freshConversation();
  const lastId = await getText(KEY_LAST_CHAT);
  if (!lastId) return freshConversation();
  const last = await conversations.get(lastId);
  if (!last || last.archived) return freshConversation();
  if (minutes < 0 || Date.now() - last.updatedAt < minutes * 60_000) return last;
  return freshConversation({
    provider: last.provider,
    cwd: last.cwd,
    agentId: last.agentId,
    permission: last.permission,
  });
}

export default function AskAI(props: Props) {
  const [conv, setConv] = useState<Conversation | undefined>();
  useEffect(() => {
    void pickConversation(props.launchContext).then(setConv);
  }, [props.launchContext]);
  if (!conv) return <List isLoading />;
  const auto = props.arguments?.prompt?.trim() || props.launchContext?.prompt;
  return <ChatView initial={conv} autoSend={auto || undefined} rememberKey={KEY_LAST_CHAT} includeProfile />;
}
