import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  getSelectedFinderItems,
  Icon,
  launchCommand,
  LaunchType,
  List,
  open,
  showToast,
  Toast,
} from "@raycast/api";
import { existsSync } from "node:fs";
import { useCallback, useEffect, useState } from "react";
import { ProjectForm } from "./components/Forms";
import { projects as store } from "./lib/storage";
import type { Project } from "./lib/types";
import { relTime, uid } from "./lib/util";

export default function ManageProjects() {
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setItems((await store.list()).sort((a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt)));
    setLoading(false);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const addFromFinder = async () => {
    try {
      const sel = await getSelectedFinderItems();
      const dir = sel.find((s) => existsSync(s.path))?.path;
      if (!dir) throw new Error("Select a folder in Finder first");
      const name = dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;
      await store.upsert({ id: uid(), name, path: dir, createdAt: Date.now() });
      await reload();
      await showToast({ style: Toast.Style.Success, title: `Added ${name}` });
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not read Finder selection",
        message: (e as Error).message,
      });
    }
  };

  const use = async (p: Project) => {
    await store.update(p.id, { lastUsedAt: Date.now() });
    await launchCommand({ name: "ask-ai", type: LaunchType.UserInitiated, context: { cwd: p.path } });
  };

  const createActions = (
    <>
      <Action.Push
        title="Add Project"
        icon={Icon.Plus}
        shortcut={{ modifiers: ["cmd"], key: "n" }}
        target={<ProjectForm onSaved={reload} />}
      />
      {process.platform === "darwin" && (
        <Action title="Add Selected Finder Folder" icon={Icon.Finder} onAction={addFromFinder} />
      )}
    </>
  );

  return (
    <List isLoading={loading} searchBarPlaceholder="Search projects…">
      <List.EmptyView
        title="No projects yet"
        description="A project is a working directory Claude Code or Codex can read (and edit, with permission)."
        actions={<ActionPanel>{createActions}</ActionPanel>}
      />
      {items.map((p) => (
        <List.Item
          key={p.id}
          title={p.name}
          subtitle={p.path}
          icon={existsSync(p.path) ? Icon.Folder : { source: Icon.Warning, tintColor: "#f5a623" }}
          accessories={[{ text: p.lastUsedAt ? `used ${relTime(p.lastUsedAt)}` : "never used" }]}
          actions={
            <ActionPanel>
              <ActionPanel.Section>
                <Action title="Ask AI in This Project" icon={Icon.Message} onAction={() => use(p)} />
                <Action
                  title="Open Folder"
                  icon={Icon.Finder}
                  shortcut={{ modifiers: ["cmd"], key: "o" }}
                  onAction={() => open(p.path)}
                />
                <Action.CopyToClipboard title="Copy Path" content={p.path} />
                <Action.Push
                  title="Edit Project"
                  icon={Icon.Pencil}
                  shortcut={{ modifiers: ["cmd"], key: "e" }}
                  target={<ProjectForm project={p} onSaved={reload} />}
                />
              </ActionPanel.Section>
              <ActionPanel.Section>{createActions}</ActionPanel.Section>
              <ActionPanel.Section>
                <Action
                  title="Remove Project"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut={{ modifiers: ["ctrl"], key: "x" }}
                  onAction={async () => {
                    if (
                      !(await confirmAlert({
                        title: `Remove "${p.name}"?`,
                        message: "Only the bookmark is removed; files stay.",
                        primaryAction: { title: "Remove", style: Alert.ActionStyle.Destructive },
                      }))
                    )
                      return;
                    await store.remove(p.id);
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
