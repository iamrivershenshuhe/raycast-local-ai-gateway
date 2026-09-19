import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Form,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatView } from "./components/ChatView";
import { prefs } from "./lib/prefs";
import { conversations, KEY_LAST_CHAT } from "./lib/storage";
import type { Conversation } from "./lib/types";
import { PROVIDER_LABEL, relTime } from "./lib/util";

type Filter = "active" | "archived" | "all";

export default function ChatHistory() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("active");
  const { push } = useNavigation();

  const reload = useCallback(async () => {
    let list = await conversations.list();
    // Auto-archive on load (cheap, no background work).
    const days = parseInt(prefs().autoArchiveDays || "0", 10);
    if (days > 0) {
      const cutoff = Date.now() - days * 86_400_000;
      let changed = false;
      list = list.map((c) => {
        if (!c.archived && !c.pinned && !c.folder && c.updatedAt < cutoff) {
          changed = true;
          return { ...c, archived: true };
        }
        return c;
      });
      if (changed) await conversations.save(list);
    }
    setItems(list.sort((a, b) => b.updatedAt - a.updatedAt));
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(
    () => items.filter((c) => (filter === "all" ? true : filter === "archived" ? c.archived : !c.archived)),
    [items, filter],
  );

  const separate = prefs().historyScope === "separate";
  const sections = useMemo(() => {
    const pinned = visible.filter((c) => c.pinned);
    const rest = visible.filter((c) => !c.pinned);
    const groups = new Map<string, Conversation[]>();
    for (const c of rest) {
      const key = c.folder ? `📁 ${c.folder}` : separate ? sourceLabel(c) : PROVIDER_LABEL[c.provider];
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    return { pinned, groups };
  }, [visible, separate]);

  const del = async (c: Conversation) => {
    if (
      prefs().warnDeleteChats &&
      !(await confirmAlert({
        title: `Delete "${c.title}"?`,
        message: "This cannot be undone.",
        primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
      }))
    )
      return;
    await conversations.remove(c.id);
    await reload();
  };

  const patch = async (c: Conversation, p: Partial<Conversation>) => {
    await conversations.update(c.id, p);
    await reload();
  };

  const row = (c: Conversation) => (
    <List.Item
      key={c.id}
      id={c.id}
      title={c.title}
      subtitle={c.messages[c.messages.length - 1]?.content.slice(0, 80).replace(/\s+/g, " ")}
      icon={c.pinned ? { source: Icon.Pin, tintColor: Color.Yellow } : c.archived ? Icon.Tray : Icon.Message}
      accessories={[
        { tag: { value: PROVIDER_LABEL[c.provider], color: Color.Blue } },
        { text: `${c.messages.length}` },
        { date: new Date(c.updatedAt), tooltip: relTime(c.updatedAt) },
      ]}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action
              title="Continue Chat"
              icon={Icon.ArrowRight}
              onAction={() => push(<ChatView initial={c} rememberKey={KEY_LAST_CHAT} includeProfile />)}
            />
            <Action.CopyToClipboard
              title="Copy Conversation"
              content={c.messages.map((m) => `**${m.role}:**\n${m.content}`).join("\n\n---\n\n")}
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="Organize">
            <Action
              title={c.pinned ? "Unpin" : "Pin"}
              icon={Icon.Pin}
              shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
              onAction={() => patch(c, { pinned: !c.pinned })}
            />
            <Action
              title={c.archived ? "Unarchive" : "Archive"}
              icon={Icon.Tray}
              shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
              onAction={() => patch(c, { archived: !c.archived })}
            />
            <Action.Push
              title="Rename…"
              icon={Icon.Pencil}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
              target={
                <TextForm
                  title="Rename Chat"
                  label="Title"
                  initial={c.title}
                  onSubmit={(v) => patch(c, { title: v || c.title })}
                />
              }
            />
            <Action.Push
              title="Move to Folder…"
              icon={Icon.Folder}
              shortcut={{ modifiers: ["cmd", "shift"], key: "f" }}
              target={
                <TextForm
                  title="Move to Folder"
                  label="Folder (empty to remove)"
                  initial={c.folder ?? ""}
                  onSubmit={(v) => patch(c, { folder: v || undefined })}
                />
              }
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="Danger">
            <Action
              title="Delete Chat"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["ctrl"], key: "x" }}
              onAction={() => del(c)}
            />
            <Action
              title="Delete All Archived Chats"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              onAction={async () => {
                if (
                  !(await confirmAlert({
                    title: "Delete all archived chats?",
                    primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
                  }))
                )
                  return;
                await conversations.save(items.filter((i) => !i.archived));
                await reload();
                await showToast({ style: Toast.Style.Success, title: "Archived chats deleted" });
              }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Search chats…"
      searchBarAccessory={
        <List.Dropdown tooltip="Filter" value={filter} onChange={(v) => setFilter(v as Filter)}>
          <List.Dropdown.Item title="Active" value="active" />
          <List.Dropdown.Item title="Archived" value="archived" />
          <List.Dropdown.Item title="All" value="all" />
        </List.Dropdown>
      }
    >
      {visible.length === 0 && (
        <List.EmptyView
          title="No chats yet"
          description="Conversations from Ask AI and Quick AI appear here."
          icon={Icon.Message}
        />
      )}
      {sections.pinned.length > 0 && <List.Section title="Pinned">{sections.pinned.map(row)}</List.Section>}
      {[...sections.groups.entries()].map(([name, list]) => (
        <List.Section key={name} title={name} subtitle={`${list.length}`}>
          {list.map(row)}
        </List.Section>
      ))}
    </List>
  );
}

function sourceLabel(c: Conversation): string {
  switch (c.source) {
    case "quick":
      return "Quick AI";
    case "agent":
      return "Agents";
    case "automation":
      return "Automations";
    case "command":
      return "AI Commands";
    default:
      return "Ask AI";
  }
}

function TextForm({
  title,
  label,
  initial,
  onSubmit,
}: {
  title: string;
  label: string;
  initial: string;
  onSubmit: (v: string) => void;
}) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle={title}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save"
            onSubmit={(v: { value: string }) => {
              onSubmit(v.value.trim());
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="value" title={label} defaultValue={initial} />
    </Form>
  );
}
