import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  Detail,
  Form,
  Icon,
  launchCommand,
  LaunchType,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { appendMemory, getText, KEY_MEMORY, KEY_MEMORY_UPDATED, setText } from "./lib/storage";
import { relTime } from "./lib/util";

export default function ShowMemory() {
  const [memory, setMemory] = useState<string | undefined>();
  const [updated, setUpdated] = useState<number | undefined>();
  const reload = useCallback(async () => {
    setMemory(await getText(KEY_MEMORY));
    const u = await getText(KEY_MEMORY_UPDATED);
    setUpdated(u ? Number(u) : undefined);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const md = memory?.trim()
    ? `# Memory\n\n${memory}`
    : `# Memory\n\n_Nothing remembered yet._\n\nAsk in any chat: **"Remember I'm vegetarian"**, use **Remember This Answer** on a reply, or add a fact here.`;

  return (
    <Detail
      isLoading={memory === undefined}
      navigationTitle="Memory"
      markdown={md}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Last updated" text={updated ? relTime(updated) : "Never"} />
          <Detail.Metadata.Label
            title="Facts"
            text={String((memory ?? "").split("\n").filter((l) => l.trim()).length)}
          />
          <Detail.Metadata.Label title="Used by" text="Ask AI, Quick AI, Agents, Automations" />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.Push
            title="Add Fact"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
            target={<FactForm onDone={reload} />}
          />
          <Action.Push
            title="Edit Memory"
            icon={Icon.Pencil}
            shortcut={{ modifiers: ["cmd"], key: "e" }}
            target={<EditForm initial={memory ?? ""} onDone={reload} />}
          />
          <Action
            title="Import Memory"
            icon={Icon.Download}
            onAction={() => launchCommand({ name: "import-memory", type: LaunchType.UserInitiated })}
          />
          {memory && <Action.CopyToClipboard title="Copy Memory" content={memory} />}
          <Action
            title="Clear Memory"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            onAction={async () => {
              if (
                !(await confirmAlert({
                  title: "Clear all memory?",
                  primaryAction: { title: "Clear", style: Alert.ActionStyle.Destructive },
                }))
              )
                return;
              await setText(KEY_MEMORY, "");
              await setText(KEY_MEMORY_UPDATED, String(Date.now()));
              await reload();
              await showToast({ style: Toast.Style.Success, title: "Memory cleared" });
            }}
          />
        </ActionPanel>
      }
    />
  );
}

function FactForm({ onDone }: { onDone: () => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="Add Fact"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Remember"
            onSubmit={async (v: { fact: string }) => {
              if (!v.fact?.trim()) return;
              await appendMemory(v.fact);
              onDone();
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="fact" title="Fact" placeholder="I prefer answers in Traditional Chinese" autoFocus />
    </Form>
  );
}

function EditForm({ initial, onDone }: { initial: string; onDone: () => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="Edit Memory"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save"
            onSubmit={async (v: { memory: string }) => {
              await setText(KEY_MEMORY, v.memory ?? "");
              await setText(KEY_MEMORY_UPDATED, String(Date.now()));
              onDone();
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea id="memory" title="Memory" defaultValue={initial} placeholder="- one fact per line" />
    </Form>
  );
}
