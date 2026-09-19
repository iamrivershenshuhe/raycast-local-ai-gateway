/**
 * PROTOTYPE — throwaway. Question: "What should a ChatGPT-style (⌥Space companion) Ask AI look like inside Raycast?"
 *
 * Three structurally different variants on one command, switchable with ⌘] / ⌘[ (persisted in LocalStorage):
 *   A  Bar → Transcript   : single-line bar (List search) → full-width transcript (Detail), follow-up via ⌘Enter form
 *   B  Persistent bar     : search bar always visible + one full transcript pane (List + single item detail)
 *   C  Compact companion  : multi-line TextArea (Form) → only the latest Q&A full-width (Detail), history hidden
 *
 * Constraint stated up front: a Raycast extension cannot draw its own floating window. The shell (window, blur,
 * search bar, action panel) is always Raycast's. These variants replicate ChatGPT's *interaction model*
 * (bar → expands into answer, Esc closes, Enter sends), not its pixels.
 *
 * Reuses the real provider layer (useChat) so streaming/cancel/resume behave like production.
 */
import { Action, ActionPanel, Detail, Form, Icon, LaunchProps, List, LocalStorage, useNavigation } from "@raycast/api";
import { useEffect, useState } from "react";
import { freshConversation } from "./ask-ai";
import { useChat } from "./hooks/useChat";
import { readClipboardText } from "./lib/context";
import { conversations } from "./lib/storage";
import type { ChatMessage, Conversation, ProviderId } from "./lib/types";
import { PROVIDER_IDS, PROVIDER_LABEL, titleFrom } from "./lib/util";

type VariantKey = "A" | "B" | "C";
const VARIANTS: Record<VariantKey, string> = {
  A: "Bar → Transcript",
  B: "Persistent bar + pane",
  C: "Compact companion (latest Q&A only)",
};
const ORDER: VariantKey[] = ["A", "B", "C"];
const KEY = "prototype.askAiVariant";

// ---------------------------------------------------------------- switcher (the "floating bar")

function useVariant() {
  const [variant, setVariant] = useState<VariantKey | undefined>();
  useEffect(() => {
    void LocalStorage.getItem<string>(KEY).then((v) => setVariant((v as VariantKey) || "A"));
  }, []);
  const cycle = (dir: 1 | -1) => {
    const i = ORDER.indexOf(variant ?? "A");
    const next = ORDER[(i + dir + ORDER.length) % ORDER.length];
    setVariant(next);
    void LocalStorage.setItem(KEY, next);
  };
  return { variant, cycle };
}

function SwitcherActions({ cycle }: { cycle: (d: 1 | -1) => void }) {
  return (
    <ActionPanel.Section title="Prototype">
      <Action
        title="Next Variant"
        icon={Icon.ArrowRight}
        shortcut={{
          macOS: { modifiers: ["cmd"], key: "]" },
          Windows: { modifiers: ["ctrl", "shift"], key: "arrowRight" },
        }}
        onAction={() => cycle(1)}
      />
      <Action
        title="Previous Variant"
        icon={Icon.ArrowLeft}
        shortcut={{
          macOS: { modifiers: ["cmd"], key: "[" },
          Windows: { modifiers: ["ctrl", "shift"], key: "arrowLeft" },
        }}
        onAction={() => cycle(-1)}
      />
    </ActionPanel.Section>
  );
}

const label = (v: VariantKey) => `Prototype ${v} — ${VARIANTS[v]}`;

// ---------------------------------------------------------------- shared markdown rendering

function bubble(m: ChatMessage): string {
  if (m.role === "user") return `> **You**\n> ${m.content.replace(/\n/g, "\n> ")}`;
  let md = m.content;
  if (m.cancelled) md += "\n\n_— stopped —_";
  if (m.error) md += `${md ? "\n\n" : ""}> ⚠️ ${m.error.replace(/\n/g, "\n> ")}`;
  return md || "_…_";
}

function transcript(conv: Conversation, streaming: string | null, running: boolean): string {
  const parts = conv.messages.map(bubble);
  if (running) parts.push(streaming?.trim() ? streaming : "_Thinking…_");
  return parts.join("\n\n---\n\n") || "_Ask anything._";
}

function latestExchange(conv: Conversation, streaming: string | null, running: boolean): string {
  const user = [...conv.messages].reverse().find((m) => m.role === "user");
  const answer = running ? streaming?.trim() || "_Thinking…_" : bubble(conv.messages[conv.messages.length - 1]);
  return `${user ? `**${titleFrom(user.content, 120)}**\n\n` : ""}${answer}`;
}

function FollowUpForm({ onSubmit, multiline }: { onSubmit: (t: string) => void; multiline: boolean }) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="Follow-up"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Send"
            icon={Icon.ArrowRight}
            onSubmit={(v: { text: string }) => {
              pop();
              if (v.text?.trim()) onSubmit(v.text);
            }}
          />
        </ActionPanel>
      }
    >
      {multiline ? (
        <Form.TextArea id="text" title="" placeholder="Reply… (⌘Enter to send)" autoFocus />
      ) : (
        <Form.TextField id="text" title="" placeholder="Reply… (Enter to send)" autoFocus />
      )}
    </Form>
  );
}

// ---------------------------------------------------------------- Variant A: bar → transcript

function VariantA({ cycle, initialPrompt }: { cycle: (d: 1 | -1) => void; initialPrompt?: string }) {
  const chat = useChat(freshConversation({ source: "chat" }), { autoSend: initialPrompt, includeProfile: true });
  const [text, setText] = useState("");
  const [recent, setRecent] = useState<Conversation[]>([]);
  useEffect(() => {
    void conversations.list().then((l) => setRecent(l.filter((c) => !c.archived).slice(0, 6)));
  }, []);
  const expanded = chat.conv.messages.length > 0 || chat.running;

  if (!expanded) {
    // Collapsed "bar" state — mimics the empty ⌥Space window: one input, recent chats underneath.
    const send = () => {
      if (text.trim()) chat.send(text);
      setText("");
    };
    const actions = (
      <ActionPanel>
        <Action title="Ask" icon={Icon.ArrowRight} onAction={send} />
        <SwitcherActions cycle={cycle} />
      </ActionPanel>
    );
    return (
      <List
        navigationTitle={label("A")}
        filtering={false}
        searchText={text}
        onSearchTextChange={setText}
        searchBarPlaceholder="Ask anything…"
        searchBarAccessory={
          <List.Dropdown tooltip="Model" value={chat.conv.provider} onChange={(v) => chat.setProvider(v as ProviderId)}>
            {PROVIDER_IDS.map((id) => (
              <List.Dropdown.Item key={id} title={PROVIDER_LABEL[id]} value={id} />
            ))}
          </List.Dropdown>
        }
      >
        <List.Section title="Suggestions">
          <List.Item title="Explain what's in my clipboard" icon={Icon.Clipboard} actions={actions} />
          <List.Item title="Summarize the selected text" icon={Icon.Text} actions={actions} />
        </List.Section>
        <List.Section title="Recent">
          {recent.map((c) => (
            <List.Item
              key={c.id}
              title={c.title}
              icon={Icon.Message}
              subtitle={PROVIDER_LABEL[c.provider]}
              actions={actions}
            />
          ))}
        </List.Section>
      </List>
    );
  }

  const last = chat.conv.messages[chat.conv.messages.length - 1];
  return (
    <Detail
      navigationTitle={label("A")}
      isLoading={chat.running}
      markdown={transcript(chat.conv, chat.streaming, chat.running)}
      actions={
        <ActionPanel>
          <Action.Push
            title="Follow-Up…"
            icon={Icon.Reply}
            target={<FollowUpForm multiline={false} onSubmit={chat.send} />}
          />
          {chat.running && (
            <Action
              title="Stop"
              icon={Icon.Stop}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["cmd", "shift"], key: "x" }}
              onAction={chat.cancel}
            />
          )}
          {last?.role === "assistant" && last.content && (
            <Action.CopyToClipboard
              title="Copy Answer"
              content={last.content}
              shortcut={{ modifiers: ["cmd"], key: "c" }}
            />
          )}
          <Action
            title="New Chat"
            icon={Icon.NewDocument}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
            onAction={chat.newChat}
          />
          <SwitcherActions cycle={cycle} />
        </ActionPanel>
      }
    />
  );
}

// ---------------------------------------------------------------- Variant B: persistent bar + one pane

function VariantB({ cycle, initialPrompt }: { cycle: (d: 1 | -1) => void; initialPrompt?: string }) {
  const chat = useChat(freshConversation({ source: "chat" }), { autoSend: initialPrompt, includeProfile: true });
  const [text, setText] = useState("");
  const [recent, setRecent] = useState<Conversation[]>([]);
  useEffect(() => {
    void conversations.list().then((l) => setRecent(l.filter((c) => !c.archived).slice(0, 8)));
  }, []);
  const send = () => {
    if (text.trim()) chat.send(text);
    setText("");
  };
  const last = chat.conv.messages[chat.conv.messages.length - 1];
  const actions = (
    <ActionPanel>
      <Action title={chat.running ? "Queue Follow-Up" : "Send"} icon={Icon.ArrowRight} onAction={send} />
      {chat.running && (
        <Action
          title="Stop"
          icon={Icon.Stop}
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["cmd", "shift"], key: "x" }}
          onAction={chat.cancel}
        />
      )}
      {last?.role === "assistant" && last.content && (
        <Action.CopyToClipboard title="Copy Answer" content={last.content} />
      )}
      <Action
        title="New Chat"
        icon={Icon.NewDocument}
        shortcut={{ modifiers: ["cmd"], key: "n" }}
        onAction={chat.newChat}
      />
      <SwitcherActions cycle={cycle} />
    </ActionPanel>
  );
  return (
    <List
      navigationTitle={label("B")}
      isShowingDetail
      isLoading={chat.running}
      filtering={false}
      searchText={text}
      onSearchTextChange={setText}
      searchBarPlaceholder={chat.running ? "Follow-up… (queued)" : "Ask anything…"}
      selectedItemId="current"
      searchBarAccessory={
        <List.Dropdown tooltip="Model" value={chat.conv.provider} onChange={(v) => chat.setProvider(v as ProviderId)}>
          {PROVIDER_IDS.map((id) => (
            <List.Dropdown.Item key={id} title={PROVIDER_LABEL[id]} value={id} />
          ))}
        </List.Dropdown>
      }
    >
      <List.Item
        id="current"
        title={chat.conv.messages.length ? chat.conv.title : "New chat"}
        subtitle={`${chat.conv.messages.length} turns`}
        icon={chat.running ? Icon.CircleProgress : Icon.Stars}
        detail={<List.Item.Detail markdown={transcript(chat.conv, chat.streaming, chat.running)} />}
        actions={actions}
      />
      <List.Section title="Recent">
        {recent.map((c) => (
          <List.Item
            key={c.id}
            id={c.id}
            title={c.title}
            icon={Icon.Message}
            detail={<List.Item.Detail markdown={transcript(c, null, false)} />}
            actions={actions}
          />
        ))}
      </List.Section>
    </List>
  );
}

// ---------------------------------------------------------------- Variant C: compact companion

function VariantC({ cycle, initialPrompt }: { cycle: (d: 1 | -1) => void; initialPrompt?: string }) {
  const chat = useChat(freshConversation({ source: "chat", permission: "ask" }), {
    autoSend: initialPrompt,
    includeProfile: true,
  });
  const [phase, setPhase] = useState<"input" | "answer">(initialPrompt ? "answer" : "input");
  const [showAll, setShowAll] = useState(false);

  if (phase === "input") {
    return (
      <Form
        navigationTitle={label("C")}
        actions={
          <ActionPanel>
            <Action.SubmitForm
              title="Ask"
              icon={Icon.ArrowRight}
              onSubmit={async (v: { text: string; provider: ProviderId; clip: boolean }) => {
                if (!v.text?.trim()) return;
                chat.setProvider(v.provider);
                let prompt = v.text;
                if (v.clip) {
                  const c = await readClipboardText();
                  if (c) prompt += `\n\n<clipboard>\n${c}\n</clipboard>`;
                }
                setPhase("answer");
                chat.send(prompt);
              }}
            />
            <SwitcherActions cycle={cycle} />
          </ActionPanel>
        }
      >
        <Form.TextArea id="text" title="" placeholder="Ask anything… (⌘Enter to send)" autoFocus />
        <Form.Dropdown id="provider" title="" defaultValue={chat.conv.provider}>
          {PROVIDER_IDS.map((id) => (
            <Form.Dropdown.Item key={id} title={PROVIDER_LABEL[id]} value={id} />
          ))}
        </Form.Dropdown>
        <Form.Checkbox id="clip" label="Include clipboard" defaultValue={false} />
      </Form>
    );
  }

  const last = chat.conv.messages[chat.conv.messages.length - 1];
  return (
    <Detail
      navigationTitle={label("C")}
      isLoading={chat.running}
      markdown={
        showAll
          ? transcript(chat.conv, chat.streaming, chat.running)
          : latestExchange(chat.conv, chat.streaming, chat.running)
      }
      actions={
        <ActionPanel>
          <Action.Push title="Reply…" icon={Icon.Reply} target={<FollowUpForm multiline onSubmit={chat.send} />} />
          {chat.running && (
            <Action
              title="Stop"
              icon={Icon.Stop}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["cmd", "shift"], key: "x" }}
              onAction={chat.cancel}
            />
          )}
          {last?.role === "assistant" && last.content && (
            <Action.CopyToClipboard title="Copy Answer" content={last.content} />
          )}
          <Action
            title={showAll ? "Show Latest Only" : "Show Whole Conversation"}
            icon={Icon.List}
            shortcut={{ modifiers: ["cmd"], key: "t" }}
            onAction={() => setShowAll((s) => !s)}
          />
          <Action
            title="New Question"
            icon={Icon.NewDocument}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
            onAction={() => {
              chat.newChat();
              setPhase("input");
            }}
          />
          <SwitcherActions cycle={cycle} />
        </ActionPanel>
      }
    />
  );
}

// ---------------------------------------------------------------- entry

export default function PrototypeAskAI(props: LaunchProps<{ arguments: { prompt?: string } }>) {
  const { variant, cycle } = useVariant();
  if (!variant) return <List isLoading />;
  const p = props.arguments?.prompt?.trim() || undefined;
  // key forces a clean remount per variant so each starts from the collapsed state.
  if (variant === "A") return <VariantA key="A" cycle={cycle} initialPrompt={p} />;
  if (variant === "B") return <VariantB key="B" cycle={cycle} initialPrompt={p} />;
  return <VariantC key="C" cycle={cycle} initialPrompt={p} />;
}
