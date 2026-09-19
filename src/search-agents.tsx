import { Action, ActionPanel, Alert, Color, confirmAlert, Icon, List, useNavigation } from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { freshConversation } from "./ask-ai";
import { ChatView } from "./components/ChatView";
import { AgentForm } from "./components/Forms";
import { prefs } from "./lib/prefs";
import { agents as store, KEY_LAST_CHAT } from "./lib/storage";
import type { Agent } from "./lib/types";
import { PERMISSION_LABEL, PROVIDER_LABEL, uid } from "./lib/util";

export default function SearchAgents() {
  const [items, setItems] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const { push } = useNavigation();
  const reload = useCallback(async () => {
    setItems(await store.list());
    setLoading(false);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const chat = (a: Agent) =>
    push(
      <ChatView
        initial={freshConversation({
          agentId: a.id,
          provider: a.provider ?? prefs().defaultProvider,
          model: a.model,
          cwd: a.cwd,
          permission: a.permission,
          source: "agent",
        })}
        navigationTitle={a.name}
        rememberKey={KEY_LAST_CHAT}
        includeProfile
      />,
    );

  return (
    <List isLoading={loading} searchBarPlaceholder="Search agents…">
      <List.EmptyView
        title="No agents yet"
        description="An agent bundles instructions, a provider, a permission mode and a project."
        actions={
          <ActionPanel>
            <Action.Push title="Create Agent" icon={Icon.Plus} target={<AgentForm onSaved={reload} />} />
          </ActionPanel>
        }
      />
      {items.map((a) => (
        <List.Item
          key={a.id}
          title={a.name}
          subtitle={a.description}
          icon={a.icon || Icon.Person}
          accessories={[
            { tag: { value: PROVIDER_LABEL[a.provider ?? prefs().defaultProvider], color: Color.Blue } },
            { text: PERMISSION_LABEL[a.permission ?? prefs().permissionMode].split(" ")[0] },
          ]}
          actions={
            <ActionPanel>
              <ActionPanel.Section>
                <Action title="Chat with Agent" icon={Icon.Message} onAction={() => chat(a)} />
                <Action.Push
                  title="Edit Agent"
                  icon={Icon.Pencil}
                  shortcut={{ modifiers: ["cmd"], key: "e" }}
                  target={<AgentForm agent={a} onSaved={reload} />}
                />
                <Action.Push
                  title="Create Agent"
                  icon={Icon.Plus}
                  shortcut={{ modifiers: ["cmd"], key: "n" }}
                  target={<AgentForm onSaved={reload} />}
                />
                <Action
                  title="Duplicate"
                  icon={Icon.Duplicate}
                  shortcut={{ modifiers: ["cmd"], key: "d" }}
                  onAction={async () => {
                    await store.upsert({
                      ...a,
                      id: uid(),
                      name: `${a.name} copy`,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    });
                    await reload();
                  }}
                />
              </ActionPanel.Section>
              <ActionPanel.Section>
                <Action.CopyToClipboard title="Export All Agents (JSON)" content={JSON.stringify(items, null, 2)} />
                <Action
                  title="Delete Agent"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut={{ modifiers: ["ctrl"], key: "x" }}
                  onAction={async () => {
                    if (
                      prefs().warnDeleteAgents &&
                      !(await confirmAlert({
                        title: `Delete "${a.name}"?`,
                        primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
                      }))
                    )
                      return;
                    await store.remove(a.id);
                    await reload();
                  }}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
