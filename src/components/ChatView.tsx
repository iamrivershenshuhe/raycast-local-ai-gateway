import {
  Action,
  ActionPanel,
  Color,
  Form,
  Icon,
  launchCommand,
  LaunchType,
  List,
  open,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { useChat, type UseChatOptions } from "../hooks/useChat";
import { readClipboardText, readSelectedText } from "../lib/context";
import { prefs } from "../lib/prefs";
import { agents as agentStore, appendMemory, projects as projectStore } from "../lib/storage";
import type { Agent, ChatMessage, Conversation, Project, ProviderId } from "../lib/types";
import {
  fmtCost,
  fmtDuration,
  PERMISSION_IDS,
  PERMISSION_LABEL,
  PROVIDER_IDS,
  PROVIDER_LABEL,
  titleFrom,
  vendorOf,
} from "../lib/util";

interface Props extends UseChatOptions {
  initial: Conversation;
  navigationTitle?: string;
}

const PROVIDER_ICON: Record<ProviderId, Icon> = {
  "claude-code": Icon.Terminal,
  codex: Icon.Terminal,
  "anthropic-api": Icon.Cloud,
  "openai-api": Icon.Cloud,
};

export function ChatView({ initial, navigationTitle, ...opts }: Props) {
  const chat = useChat(initial, opts);
  const { conv, streaming, activity, running, queue, pendingContext } = chat;
  const [searchText, setSearchText] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();

  useEffect(() => {
    void projectStore.list().then(setProjects);
    void agentStore.list().then(setAgents);
  }, []);

  // Follow the newest message while a run is in progress or after a new answer arrives.
  const lastId = conv.messages[conv.messages.length - 1]?.id;
  useEffect(() => {
    if (lastId) setSelectedId(running ? "streaming" : lastId);
  }, [lastId, running]);

  const agent = useMemo(() => agents.find((a) => a.id === conv.agentId), [agents, conv.agentId]);
  const project = useMemo(() => projects.find((p) => p.path === conv.cwd), [projects, conv.cwd]);
  const permission = conv.permission ?? agent?.permission ?? prefs().permissionMode;
  const showBadge = prefs().showProviderBadge;

  const submit = () => {
    const text = searchText;
    if (!text.trim()) return;
    setSearchText("");
    chat.send(text);
  };

  const attachSelection = async () => {
    const t = await readSelectedText();
    if (!t) return void showToast({ style: Toast.Style.Failure, title: "No text selected" });
    chat.setPendingContext({ label: "selected_text", text: t });
    await showToast({ style: Toast.Style.Success, title: "Selected text attached to next message" });
  };
  const attachClipboard = async () => {
    const t = await readClipboardText();
    if (!t) return void showToast({ style: Toast.Style.Failure, title: "Clipboard is empty" });
    chat.setPendingContext({ label: "clipboard", text: t });
    await showToast({ style: Toast.Style.Success, title: "Clipboard attached to next message" });
  };

  const lastAnswer = [...conv.messages].reverse().find((m) => m.role === "assistant" && m.content && !m.error);

  const settingsActions = (
    <>
      <ActionPanel.Submenu title="Provider" icon={Icon.Switch} shortcut={{ modifiers: ["cmd"], key: "p" }}>
        {PROVIDER_IDS.map((id) => (
          <Action
            key={id}
            title={PROVIDER_LABEL[id]}
            icon={id === conv.provider ? Icon.CheckCircle : Icon.Circle}
            onAction={() => chat.setProvider(id)}
          />
        ))}
      </ActionPanel.Submenu>
      <ActionPanel.Submenu
        title="Permission Mode"
        icon={Icon.Lock}
        shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
      >
        {PERMISSION_IDS.map((id) => (
          <Action
            key={id}
            title={PERMISSION_LABEL[id]}
            icon={id === permission ? Icon.CheckCircle : Icon.Circle}
            onAction={() => chat.setPermission(id)}
          />
        ))}
      </ActionPanel.Submenu>
      <ActionPanel.Submenu
        title="Project (Working Directory)"
        icon={Icon.Folder}
        shortcut={{ modifiers: ["cmd"], key: "d" }}
      >
        <Action
          title="No Working Directory"
          icon={!conv.cwd ? Icon.CheckCircle : Icon.Circle}
          onAction={() => chat.setCwd(undefined)}
        />
        {projects.map((p) => (
          <Action
            key={p.id}
            title={p.name}
            icon={p.path === conv.cwd ? Icon.CheckCircle : Icon.Circle}
            onAction={() => chat.setCwd(p.path)}
          />
        ))}
        <Action.Push title="Custom Directory…" icon={Icon.Plus} target={<CwdForm onSubmit={(p) => chat.setCwd(p)} />} />
      </ActionPanel.Submenu>
      <ActionPanel.Submenu title="Agent" icon={Icon.Person} shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}>
        <Action
          title="No Agent"
          icon={!conv.agentId ? Icon.CheckCircle : Icon.Circle}
          onAction={() => chat.setAgent(undefined)}
        />
        {agents.map((a) => (
          <Action
            key={a.id}
            title={a.name}
            icon={a.id === conv.agentId ? Icon.CheckCircle : a.icon || Icon.Circle}
            onAction={() => chat.setAgent(a.id)}
          />
        ))}
      </ActionPanel.Submenu>
      <Action.Push
        title="Set Model…"
        icon={Icon.Cog}
        shortcut={{ modifiers: ["cmd"], key: "m" }}
        target={<ModelForm current={conv.model} onSubmit={(m) => chat.setModel(m)} />}
      />
    </>
  );

  const contextActions = (
    <ActionPanel.Section title="Context">
      <Action
        title="Attach Selected Text"
        icon={Icon.Text}
        shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
        onAction={attachSelection}
      />
      <Action
        title="Attach Clipboard"
        icon={Icon.Clipboard}
        shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
        onAction={attachClipboard}
      />
      {pendingContext && (
        <Action
          title="Remove Attached Context"
          icon={Icon.XMarkCircle}
          onAction={() => chat.setPendingContext(undefined)}
        />
      )}
      {conv.cwd && <Action title="Open Project Folder" icon={Icon.Finder} onAction={() => open(conv.cwd!)} />}
    </ActionPanel.Section>
  );

  const commonActions = (message?: ChatMessage) => (
    <ActionPanel>
      <ActionPanel.Section>
        {searchText.trim() ? (
          <Action
            title={running ? (prefs().followUpBehavior === "steer" ? "Steer" : "Queue Follow-Up") : "Send"}
            icon={Icon.ArrowRight}
            onAction={submit}
          />
        ) : message?.role === "assistant" && message.content ? (
          <Action.CopyToClipboard title="Copy Answer" content={message.content} />
        ) : lastAnswer ? (
          <Action.CopyToClipboard title="Copy Last Answer" content={lastAnswer.content} />
        ) : (
          <Action title="Send" icon={Icon.ArrowRight} onAction={submit} />
        )}
        {running && (
          <Action
            title="Cancel Request"
            icon={Icon.Stop}
            style={Action.Style.Destructive}
            shortcut={{ modifiers: ["cmd", "shift"], key: "x" }}
            onAction={chat.cancel}
          />
        )}
        {message?.role === "assistant" && message.content && (
          <Action.Paste
            title="Paste Answer"
            content={message.content}
            shortcut={{ modifiers: ["cmd", "shift"], key: "return" }}
          />
        )}
        {message?.role === "user" && (
          <Action
            title="Resend"
            icon={Icon.Repeat}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={() => chat.send(message.content)}
          />
        )}
        <Action
          title="New Chat"
          icon={Icon.NewDocument}
          shortcut={{ modifiers: ["cmd"], key: "n" }}
          onAction={chat.newChat}
        />
      </ActionPanel.Section>
      <ActionPanel.Section title="Settings">{settingsActions}</ActionPanel.Section>
      {contextActions}
      <ActionPanel.Section title="More">
        {message?.role === "assistant" && message.content && (
          <Action
            title="Remember This Answer"
            icon={Icon.Bookmark}
            onAction={async () => {
              await appendMemory(titleFrom(message.content, 400));
              await showToast({ style: Toast.Style.Success, title: "Saved to memory" });
            }}
          />
        )}
        {conv.messages.length > 0 && (
          <Action.CopyToClipboard
            title="Copy Conversation"
            content={conv.messages.map((m) => `**${m.role}:**\n${m.content}`).join("\n\n---\n\n")}
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
          />
        )}
        <Action
          title="Open Chat History"
          icon={Icon.Clock}
          shortcut={{ modifiers: ["cmd"], key: "h" }}
          onAction={() => launchCommand({ name: "chat-history", type: LaunchType.UserInitiated })}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );

  const metadataFor = (m?: ChatMessage) => (
    <List.Item.Detail.Metadata>
      {showBadge && (
        <List.Item.Detail.Metadata.TagList title="Sent to">
          <List.Item.Detail.Metadata.TagList.Item
            text={`${PROVIDER_LABEL[m?.meta?.provider ?? conv.provider]} · ${vendorOf(m?.meta?.provider ?? conv.provider)}`}
            color={Color.Blue}
          />
        </List.Item.Detail.Metadata.TagList>
      )}
      <List.Item.Detail.Metadata.Label title="Model" text={m?.meta?.model ?? conv.model ?? "provider default"} />
      <List.Item.Detail.Metadata.Label title="Permission" text={PERMISSION_LABEL[m?.meta?.permission ?? permission]} />
      <List.Item.Detail.Metadata.Label title="Project" text={project?.name ?? conv.cwd ?? "none"} />
      {agent && <List.Item.Detail.Metadata.Label title="Agent" text={agent.name} />}
      {(m?.meta?.costUsd !== undefined || m?.meta?.durationMs) && (
        <>
          <List.Item.Detail.Metadata.Separator />
          {m?.meta?.durationMs && (
            <List.Item.Detail.Metadata.Label title="Duration" text={fmtDuration(m.meta.durationMs)} />
          )}
          {m?.meta?.costUsd !== undefined && (
            <List.Item.Detail.Metadata.Label title="Cost" text={fmtCost(m.meta.costUsd)} />
          )}
          {m?.meta?.outputTokens !== undefined && (
            <List.Item.Detail.Metadata.Label
              title="Tokens"
              text={`${m.meta.inputTokens ?? 0} in / ${m.meta.outputTokens} out`}
            />
          )}
        </>
      )}
      {conv.providerSessionId && (
        <List.Item.Detail.Metadata.Label title="Session" text={conv.providerSessionId.slice(0, 8)} />
      )}
    </List.Item.Detail.Metadata>
  );

  const markdownFor = (m: ChatMessage) => {
    let md = m.content || "";
    if (m.cancelled) md += "\n\n_— cancelled —_";
    if (m.error) md += `${md ? "\n\n" : ""}> ⚠️ ${m.error.replace(/\n/g, "\n> ")}`;
    if (m.meta?.activity?.length)
      md += `\n\n<details><summary>Activity</summary>\n\n${m.meta.activity.map((a) => `- ${a}`).join("\n")}\n</details>`;
    return md || "_(empty)_";
  };

  const title = navigationTitle ?? (conv.messages.length ? conv.title : "Ask AI");
  const subtitleBits = [PROVIDER_LABEL[conv.provider], project?.name, agent?.name].filter(Boolean).join(" · ");

  return (
    <List
      navigationTitle={`${title} — ${subtitleBits}`}
      isShowingDetail
      isLoading={running}
      filtering={false}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder={
        running
          ? prefs().followUpBehavior === "steer"
            ? "Type to steer, Enter to send…"
            : "Type a follow-up, Enter to queue…"
          : "Ask anything… (Enter to send)"
      }
      selectedItemId={selectedId}
      onSelectionChange={(id) => setSelectedId(id ?? undefined)}
      searchBarAccessory={
        <List.Dropdown tooltip="Provider" value={conv.provider} onChange={(v) => chat.setProvider(v as ProviderId)}>
          {PROVIDER_IDS.map((id) => (
            <List.Dropdown.Item key={id} title={PROVIDER_LABEL[id]} value={id} icon={PROVIDER_ICON[id]} />
          ))}
        </List.Dropdown>
      }
    >
      {conv.messages.length === 0 && !running && (
        <List.Item
          id="empty"
          title="Ask anything"
          icon={Icon.Stars}
          detail={
            <List.Item.Detail
              markdown={`# ${PROVIDER_LABEL[conv.provider]}\n\nType a question in the search bar and press **Enter**.\n\n- ${PERMISSION_LABEL[permission]}\n- Project: ${project?.name ?? conv.cwd ?? "none"}\n- Agent: ${agent?.name ?? "none"}${pendingContext ? `\n- Attached: ${pendingContext.label} (${pendingContext.text.length} chars)` : ""}\n\nShortcuts: ⌘P provider · ⌘⇧P permission · ⌘D project · ⌘⇧A agent · ⌘M model · ⌘⇧S attach selection · ⌘⇧V attach clipboard · ⌘N new chat · ⌘H history`}
              metadata={metadataFor()}
            />
          }
          actions={commonActions()}
        />
      )}
      {conv.messages.map((m) => (
        <List.Item
          key={m.id}
          id={m.id}
          title={titleFrom(m.content || (m.error ? "Error" : ""), 70)}
          icon={
            m.role === "user"
              ? { source: Icon.Person, tintColor: Color.SecondaryText }
              : m.error
                ? { source: Icon.ExclamationMark, tintColor: Color.Red }
                : { source: Icon.Stars, tintColor: Color.Purple }
          }
          accessories={
            m.role === "assistant" && showBadge
              ? [{ tag: { value: PROVIDER_LABEL[m.meta?.provider ?? conv.provider], color: Color.Blue } }]
              : undefined
          }
          detail={
            <List.Item.Detail
              markdown={markdownFor(m)}
              metadata={m.role === "assistant" ? metadataFor(m) : undefined}
            />
          }
          actions={commonActions(m)}
        />
      ))}
      {running && (
        <List.Item
          id="streaming"
          title={streaming ? titleFrom(streaming, 70) : "Thinking…"}
          icon={{ source: Icon.CircleProgress, tintColor: Color.Purple }}
          accessories={[{ tag: { value: PROVIDER_LABEL[conv.provider], color: Color.Orange } }]}
          detail={
            <List.Item.Detail
              markdown={`${streaming || "_Waiting for the first token…_"}\n\n${
                activity.length
                  ? `\n\n---\n${activity
                      .slice(-6)
                      .map((a) => `- ${a}`)
                      .join("\n")}`
                  : ""
              }${queue.length ? `\n\n---\n_${queue.length} queued follow-up(s)_` : ""}`}
              metadata={metadataFor()}
            />
          }
          actions={commonActions()}
        />
      )}
    </List>
  );
}

function CwdForm({ onSubmit }: { onSubmit: (path: string) => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Use Directory"
            onSubmit={(v: { dir: string[]; path: string }) => {
              const p = v.dir?.[0] || v.path?.trim();
              if (!p) return void showToast({ style: Toast.Style.Failure, title: "Pick a directory" });
              onSubmit(p);
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="dir"
        title="Directory"
        allowMultipleSelection={false}
        canChooseDirectories
        canChooseFiles={false}
      />
      <Form.TextField id="path" title="Or type a path" placeholder="C:\\Users\\me\\project or ~/Developer/app" />
    </Form>
  );
}

function ModelForm({ current, onSubmit }: { current?: string; onSubmit: (model?: string) => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Set Model"
            onSubmit={(v: { model: string }) => {
              onSubmit(v.model);
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="model"
        title="Model"
        defaultValue={current ?? ""}
        placeholder="Leave empty for the provider default (e.g. sonnet, opus, gpt-5-codex)"
      />
      <Form.Description text="Claude Code accepts aliases (sonnet / opus / fable) or full ids. Codex uses -m. API providers use the exact model id." />
    </Form>
  );
}
