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
import { useCallback, useEffect, useState } from "react";
import { CommandForm } from "./components/Forms";
import { RunPromptView } from "./components/RunPromptView";
import { readClipboardText, readSelectedText } from "./lib/context";
import { prefs, truncate } from "./lib/prefs";
import { deleteCommand, listCommands, restoreBuiltInCommands, saveCommand } from "./lib/storage";
import type { AICommand } from "./lib/types";
import { fillTemplate, PROVIDER_LABEL, uid } from "./lib/util";

async function buildPrompt(cmd: AICommand, input?: string): Promise<string> {
  const needsSel = cmd.prompt.includes("{selection}");
  const needsClip = cmd.prompt.includes("{clipboard}");
  const hasAny = needsSel || needsClip || cmd.prompt.includes("{input}");
  const selection = needsSel || !hasAny ? await readSelectedText() : undefined;
  const clipboard = needsClip || (!hasAny && !selection) ? await readClipboardText() : undefined;
  if (needsSel && !selection) throw new Error("This command needs selected text.");
  if (needsClip && !clipboard) throw new Error("This command needs clipboard text.");
  let prompt = fillTemplate(cmd.prompt, {
    selection: selection ? truncate(selection) : undefined,
    clipboard: clipboard ? truncate(clipboard) : undefined,
    input: input ?? "",
  });
  if (!hasAny) {
    const ctx = selection ?? clipboard;
    if (ctx) prompt += `\n\n<text>\n${truncate(ctx)}\n</text>`;
  }
  return prompt;
}

export default function SearchAICommands() {
  const [items, setItems] = useState<AICommand[]>([]);
  const [loading, setLoading] = useState(true);
  const { push } = useNavigation();
  const reload = useCallback(async () => {
    setItems(await listCommands());
    setLoading(false);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (cmd: AICommand, input?: string) => {
    try {
      const prompt = await buildPrompt(cmd, input);
      push(
        <RunPromptView
          title={cmd.name}
          prompt={prompt}
          output={cmd.output}
          provider={cmd.provider}
          model={cmd.model}
          agentId={cmd.agentId}
          permission="ask"
          source="command"
          includeProfile={false}
        />,
      );
    } catch (e) {
      await showToast({ style: Toast.Style.Failure, title: (e as Error).message });
    }
  };

  const start = (cmd: AICommand) => {
    if (cmd.prompt.includes("{input}")) push(<InputForm cmd={cmd} onSubmit={(v) => run(cmd, v)} />);
    else void run(cmd);
  };

  const custom = items.filter((c) => !c.builtIn);
  const builtins = items.filter((c) => c.builtIn);

  const row = (c: AICommand) => (
    <List.Item
      key={c.id}
      title={c.name}
      subtitle={c.description}
      icon={c.icon || Icon.Wand}
      accessories={[
        ...(c.provider ? [{ tag: { value: PROVIDER_LABEL[c.provider], color: Color.Blue } }] : []),
        { text: c.output },
      ]}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action title="Run Command" icon={Icon.Play} onAction={() => start(c)} />
            <Action.Push
              title="Edit Command"
              icon={Icon.Pencil}
              shortcut={{ modifiers: ["cmd"], key: "e" }}
              target={<CommandForm command={c} onSaved={reload} />}
            />
            <Action.Push
              title="Create Command"
              icon={Icon.Plus}
              shortcut={{ modifiers: ["cmd"], key: "n" }}
              target={<CommandForm onSaved={reload} />}
            />
            <Action
              title="Duplicate"
              icon={Icon.Duplicate}
              shortcut={{ modifiers: ["cmd"], key: "d" }}
              onAction={async () => {
                await saveCommand({
                  ...c,
                  id: uid(),
                  name: `${c.name} copy`,
                  builtIn: false,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                });
                await reload();
              }}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard title="Copy Prompt Template" content={c.prompt} />
            <Action.CopyToClipboard title="Export All Commands (JSON)" content={JSON.stringify(items, null, 2)} />
            <Action
              title="Restore Built-in Commands"
              icon={Icon.ArrowCounterClockwise}
              onAction={async () => {
                await restoreBuiltInCommands();
                await reload();
              }}
            />
            <Action
              title={c.builtIn ? "Hide Built-in Command" : "Delete Command"}
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["ctrl"], key: "x" }}
              onAction={async () => {
                if (
                  prefs().warnDeleteCommands &&
                  !(await confirmAlert({
                    title: `${c.builtIn ? "Hide" : "Delete"} "${c.name}"?`,
                    primaryAction: { title: c.builtIn ? "Hide" : "Delete", style: Alert.ActionStyle.Destructive },
                  }))
                )
                  return;
                await deleteCommand(c.id);
                await reload();
              }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );

  return (
    <List isLoading={loading} searchBarPlaceholder="Search AI commands…">
      {custom.length > 0 && <List.Section title="My Commands">{custom.map(row)}</List.Section>}
      <List.Section title="Built-in">{builtins.map(row)}</List.Section>
    </List>
  );
}

function InputForm({ cmd, onSubmit }: { cmd: AICommand; onSubmit: (v: string) => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle={cmd.name}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Run"
            icon={Icon.Play}
            onSubmit={(v: { input: string }) => {
              pop();
              onSubmit(v.input ?? "");
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="input" title="Input" placeholder="Value for {input} (e.g. target language, tone)" autoFocus />
    </Form>
  );
}
