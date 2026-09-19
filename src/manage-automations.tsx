import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Detail,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { AutomationForm } from "./components/Forms";
import { INTERVAL_MS, runAutomation } from "./lib/automations";
import { prefs } from "./lib/prefs";
import { automations as store } from "./lib/storage";
import type { Automation } from "./lib/types";
import { PROVIDER_LABEL, relTime } from "./lib/util";

export default function ManageAutomations() {
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | undefined>();
  const { push } = useNavigation();
  const reload = useCallback(async () => {
    setItems(await store.list());
    setLoading(false);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const runNow = async (a: Automation) => {
    setBusy(a.id);
    const toast = await showToast({ style: Toast.Style.Animated, title: `Running ${a.name}…` });
    const r = await runAutomation(a);
    setBusy(undefined);
    await reload();
    toast.style = r.lastError ? Toast.Style.Failure : Toast.Style.Success;
    toast.title = r.lastError ? `${a.name} failed` : `${a.name} finished`;
    toast.message = r.lastError ?? r.lastResult?.slice(0, 80);
    if (!r.lastError) push(<ResultView a={r} />);
  };

  return (
    <List isLoading={loading || Boolean(busy)} searchBarPlaceholder="Search automations…">
      <List.EmptyView
        title="No automations yet"
        description="Schedule a prompt to run in the background and keep its latest result here."
        actions={
          <ActionPanel>
            <Action.Push title="Create Automation" icon={Icon.Plus} target={<AutomationForm onSaved={reload} />} />
          </ActionPanel>
        }
      />
      {items.map((a) => {
        const next = a.enabled ? (a.lastRunAt ? a.lastRunAt + INTERVAL_MS[a.interval] : Date.now()) : undefined;
        return (
          <List.Item
            key={a.id}
            title={a.name}
            subtitle={a.prompt.slice(0, 60).replace(/\s+/g, " ")}
            icon={
              a.enabled
                ? { source: Icon.Clock, tintColor: Color.Green }
                : { source: Icon.Clock, tintColor: Color.SecondaryText }
            }
            accessories={[
              { tag: { value: PROVIDER_LABEL[a.provider ?? prefs().defaultProvider], color: Color.Blue } },
              { text: `every ${a.interval}` },
              a.lastError ? { icon: { source: Icon.Warning, tintColor: Color.Red }, tooltip: a.lastError } : {},
              {
                text: a.lastRunAt ? `ran ${relTime(a.lastRunAt)}` : "never ran",
                tooltip: next ? `next ≈ ${new Date(next).toLocaleString()}` : "disabled",
              },
            ]}
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  {(a.lastResult || a.lastError) && (
                    <Action.Push title="View Last Result" icon={Icon.Eye} target={<ResultView a={a} />} />
                  )}
                  <Action
                    title="Run Now"
                    icon={Icon.Play}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                    onAction={() => runNow(a)}
                  />
                  <Action
                    title={a.enabled ? "Disable" : "Enable"}
                    icon={a.enabled ? Icon.Pause : Icon.Play}
                    shortcut={{ modifiers: ["cmd"], key: "t" }}
                    onAction={async () => {
                      await store.update(a.id, { enabled: !a.enabled });
                      await reload();
                    }}
                  />
                  <Action.Push
                    title="Edit Automation"
                    icon={Icon.Pencil}
                    shortcut={{ modifiers: ["cmd"], key: "e" }}
                    target={<AutomationForm automation={a} onSaved={reload} />}
                  />
                  <Action.Push
                    title="Create Automation"
                    icon={Icon.Plus}
                    shortcut={{ modifiers: ["cmd"], key: "n" }}
                    target={<AutomationForm onSaved={reload} />}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action
                    title="Delete Automation"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={{ modifiers: ["ctrl"], key: "x" }}
                    onAction={async () => {
                      if (
                        prefs().warnDeleteAutomations &&
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
        );
      })}
    </List>
  );
}

function ResultView({ a }: { a: Automation }) {
  const md = `# ${a.name}\n\n${a.lastError ? `> ⚠️ ${a.lastError}\n\n` : ""}${a.lastResult ?? "_No result yet._"}`;
  return (
    <Detail
      navigationTitle={a.name}
      markdown={md}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title="Last run"
            text={a.lastRunAt ? new Date(a.lastRunAt).toLocaleString() : "never"}
          />
          <Detail.Metadata.Label title="Interval" text={a.interval} />
          <Detail.Metadata.Label title="Runs" text={String(a.runCount ?? 0)} />
          <Detail.Metadata.Label title="Provider" text={PROVIDER_LABEL[a.provider ?? prefs().defaultProvider]} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          {a.lastResult && <Action.CopyToClipboard title="Copy Result" content={a.lastResult} />}
          {a.lastResult && <Action.Paste title="Paste Result" content={a.lastResult} />}
        </ActionPanel>
      }
    />
  );
}
