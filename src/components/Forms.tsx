import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { readFileSync } from "node:fs";
import { useEffect, useState } from "react";
import { prefs } from "../lib/prefs";
import {
  agents as agentStore,
  automations as automationStore,
  projects as projectStore,
  saveCommand,
} from "../lib/storage";
import type {
  Agent,
  AICommand,
  Automation,
  AutomationInterval,
  CommandOutput,
  PermissionMode,
  Project,
  ProviderId,
} from "../lib/types";
import { PERMISSION_IDS, PERMISSION_LABEL, PROVIDER_IDS, PROVIDER_LABEL, uid } from "../lib/util";

const INHERIT = "__inherit__";

function ProviderDropdown({ id, title, defaultValue }: { id: string; title: string; defaultValue?: string }) {
  return (
    <Form.Dropdown id={id} title={title} defaultValue={defaultValue ?? INHERIT}>
      <Form.Dropdown.Item value={INHERIT} title={`Default (${PROVIDER_LABEL[prefs().defaultProvider]})`} />
      {PROVIDER_IDS.map((p) => (
        <Form.Dropdown.Item key={p} value={p} title={PROVIDER_LABEL[p]} />
      ))}
    </Form.Dropdown>
  );
}

function PermissionDropdown({ id, defaultValue }: { id: string; defaultValue?: string }) {
  return (
    <Form.Dropdown id={id} title="Permission Mode" defaultValue={defaultValue ?? INHERIT}>
      <Form.Dropdown.Item value={INHERIT} title={`Default (${PERMISSION_LABEL[prefs().permissionMode]})`} />
      {PERMISSION_IDS.map((p) => (
        <Form.Dropdown.Item key={p} value={p} title={PERMISSION_LABEL[p]} />
      ))}
    </Form.Dropdown>
  );
}

function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    void projectStore.list().then(setProjects);
  }, []);
  return projects;
}

function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  useEffect(() => {
    void agentStore.list().then(setAgents);
  }, []);
  return agents;
}

function ProjectDropdown({ id, defaultValue, projects }: { id: string; defaultValue?: string; projects: Project[] }) {
  return (
    <Form.Dropdown id={id} title="Project" defaultValue={defaultValue ?? ""}>
      <Form.Dropdown.Item value="" title="None" />
      {projects.map((p) => (
        <Form.Dropdown.Item key={p.id} value={p.path} title={p.name} />
      ))}
    </Form.Dropdown>
  );
}

const opt = (v: string | undefined) => (v && v !== INHERIT ? v : undefined);

// ---------------------------------------------------------------- Agent

export function AgentForm({ agent, onSaved }: { agent?: Agent; onSaved?: (a: Agent) => void }) {
  const { pop } = useNavigation();
  const projects = useProjects();
  return (
    <Form
      navigationTitle={agent ? `Edit ${agent.name}` : "Create Agent"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={agent ? "Save Agent" : "Create Agent"}
            icon={Icon.Check}
            onSubmit={async (v: Record<string, string>) => {
              if (!v.name?.trim()) return void showToast({ style: Toast.Style.Failure, title: "Name is required" });
              const saved: Agent = {
                id: agent?.id ?? uid(),
                name: v.name.trim(),
                description: v.description?.trim() || undefined,
                icon: v.icon?.trim() || undefined,
                instructions: v.instructions ?? "",
                provider: opt(v.provider) as ProviderId | undefined,
                model: v.model?.trim() || undefined,
                permission: opt(v.permission) as PermissionMode | undefined,
                cwd: v.cwd || undefined,
                createdAt: agent?.createdAt ?? Date.now(),
                updatedAt: Date.now(),
              };
              await agentStore.upsert(saved);
              await showToast({ style: Toast.Style.Success, title: agent ? "Agent saved" : "Agent created" });
              onSaved?.(saved);
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" defaultValue={agent?.name} placeholder="Code Reviewer" />
      <Form.TextField id="icon" title="Icon (emoji)" defaultValue={agent?.icon} placeholder="🧑‍💻" />
      <Form.TextField
        id="description"
        title="Description"
        defaultValue={agent?.description}
        placeholder="Reviews diffs for bugs and style"
      />
      <Form.TextArea
        id="instructions"
        title="Instructions"
        defaultValue={agent?.instructions}
        placeholder="You are a meticulous reviewer. Always list issues by severity…"
        enableMarkdown
      />
      <Form.Separator />
      <ProviderDropdown id="provider" title="Provider" defaultValue={agent?.provider} />
      <Form.TextField
        id="model"
        title="Model"
        defaultValue={agent?.model}
        placeholder="Leave empty for provider default"
      />
      <PermissionDropdown id="permission" defaultValue={agent?.permission} />
      <ProjectDropdown id="cwd" defaultValue={agent?.cwd} projects={projects} />
    </Form>
  );
}

// ---------------------------------------------------------------- AI Command

export function CommandForm({ command, onSaved }: { command?: AICommand; onSaved?: (c: AICommand) => void }) {
  const { pop } = useNavigation();
  const agents = useAgents();
  return (
    <Form
      navigationTitle={command ? `Edit ${command.name}` : "Create AI Command"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={command ? "Save Command" : "Create Command"}
            icon={Icon.Check}
            onSubmit={async (v: Record<string, string>) => {
              if (!v.name?.trim()) return void showToast({ style: Toast.Style.Failure, title: "Name is required" });
              if (!v.prompt?.trim()) return void showToast({ style: Toast.Style.Failure, title: "Prompt is required" });
              const saved: AICommand = {
                id: command?.id ?? uid(),
                name: v.name.trim(),
                description: v.description?.trim() || undefined,
                icon: v.icon?.trim() || undefined,
                prompt: v.prompt,
                provider: opt(v.provider) as ProviderId | undefined,
                model: v.model?.trim() || undefined,
                agentId: v.agentId || undefined,
                output: (v.output as CommandOutput) || "view",
                builtIn: command?.builtIn,
                createdAt: command?.createdAt ?? Date.now(),
                updatedAt: Date.now(),
              };
              await saveCommand(saved);
              await showToast({ style: Toast.Style.Success, title: command ? "Command saved" : "Command created" });
              onSaved?.(saved);
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" defaultValue={command?.name} placeholder="Explain Error" />
      <Form.TextField id="icon" title="Icon (emoji)" defaultValue={command?.icon} placeholder="🔍" />
      <Form.TextField id="description" title="Description" defaultValue={command?.description} />
      <Form.TextArea
        id="prompt"
        title="Prompt"
        defaultValue={command?.prompt}
        placeholder={"Explain this error and how to fix it:\n\n{selection}"}
        info="Placeholders: {selection} = selected text, {clipboard} = clipboard, {input} = asked when the command runs. If none is present, the selected text (or clipboard) is appended."
      />
      <Form.Dropdown id="output" title="Output" defaultValue={command?.output ?? "view"}>
        <Form.Dropdown.Item value="view" title="Show result" />
        <Form.Dropdown.Item value="paste" title="Paste result into frontmost app" />
        <Form.Dropdown.Item value="replace" title="Replace selection (paste over it)" />
        <Form.Dropdown.Item value="copy" title="Copy result to clipboard" />
      </Form.Dropdown>
      <Form.Separator />
      <ProviderDropdown id="provider" title="Provider" defaultValue={command?.provider} />
      <Form.TextField
        id="model"
        title="Model"
        defaultValue={command?.model}
        placeholder="Leave empty for provider default"
      />
      <Form.Dropdown id="agentId" title="Agent" defaultValue={command?.agentId ?? ""}>
        <Form.Dropdown.Item value="" title="None" />
        {agents.map((a) => (
          <Form.Dropdown.Item key={a.id} value={a.id} title={a.name} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}

// ---------------------------------------------------------------- Automation

export function AutomationForm({
  automation,
  onSaved,
}: {
  automation?: Automation;
  onSaved?: (a: Automation) => void;
}) {
  const { pop } = useNavigation();
  const agents = useAgents();
  const projects = useProjects();
  return (
    <Form
      navigationTitle={automation ? `Edit ${automation.name}` : "Create Automation"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={automation ? "Save Automation" : "Create Automation"}
            icon={Icon.Check}
            onSubmit={async (v: Record<string, string | boolean>) => {
              const name = String(v.name ?? "").trim();
              const prompt = String(v.prompt ?? "").trim();
              if (!name) return void showToast({ style: Toast.Style.Failure, title: "Name is required" });
              if (!prompt) return void showToast({ style: Toast.Style.Failure, title: "Prompt is required" });
              const saved: Automation = {
                id: automation?.id ?? uid(),
                name,
                prompt,
                provider: opt(v.provider as string) as ProviderId | undefined,
                model: String(v.model ?? "").trim() || undefined,
                agentId: (v.agentId as string) || undefined,
                cwd: (v.cwd as string) || undefined,
                permission: opt(v.permission as string) as PermissionMode | undefined,
                interval: (v.interval as AutomationInterval) || "1d",
                enabled: Boolean(v.enabled),
                createdAt: automation?.createdAt ?? Date.now(),
                lastRunAt: automation?.lastRunAt,
                lastResult: automation?.lastResult,
                lastError: automation?.lastError,
                runCount: automation?.runCount,
              };
              await automationStore.upsert(saved);
              await showToast({
                style: Toast.Style.Success,
                title: automation ? "Automation saved" : "Automation created",
              });
              onSaved?.(saved);
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" defaultValue={automation?.name} placeholder="Daily repo health check" />
      <Form.TextArea
        id="prompt"
        title="Prompt"
        defaultValue={automation?.prompt}
        placeholder="Summarize open TODOs in this project and flag anything risky."
      />
      <Form.Dropdown id="interval" title="Run every" defaultValue={automation?.interval ?? "1d"}>
        <Form.Dropdown.Item value="15m" title="15 minutes" />
        <Form.Dropdown.Item value="1h" title="Hour" />
        <Form.Dropdown.Item value="6h" title="6 hours" />
        <Form.Dropdown.Item value="1d" title="Day" />
        <Form.Dropdown.Item value="1w" title="Week" />
      </Form.Dropdown>
      <Form.Checkbox id="enabled" label="Enabled" defaultValue={automation?.enabled ?? true} />
      <Form.Description text="Automations run in the background (Raycast wakes the runner every 15 minutes while Raycast is open). Results are kept in Manage Automations." />
      <Form.Separator />
      <ProviderDropdown id="provider" title="Provider" defaultValue={automation?.provider} />
      <Form.TextField
        id="model"
        title="Model"
        defaultValue={automation?.model}
        placeholder="Leave empty for provider default"
      />
      <PermissionDropdown id="permission" defaultValue={automation?.permission} />
      <ProjectDropdown id="cwd" defaultValue={automation?.cwd} projects={projects} />
      <Form.Dropdown id="agentId" title="Agent" defaultValue={automation?.agentId ?? ""}>
        <Form.Dropdown.Item value="" title="None" />
        {agents.map((a) => (
          <Form.Dropdown.Item key={a.id} value={a.id} title={a.name} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}

// ---------------------------------------------------------------- Project

export function ProjectForm({ project, onSaved }: { project?: Project; onSaved?: (p: Project) => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle={project ? `Edit ${project.name}` : "Add Project"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={project ? "Save Project" : "Add Project"}
            icon={Icon.Check}
            onSubmit={async (v: { name: string; dir: string[]; path: string; description: string }) => {
              const path = (v.dir?.[0] || v.path || "").trim();
              if (!path) return void showToast({ style: Toast.Style.Failure, title: "Pick a directory" });
              const name = v.name?.trim() || path.split(/[\\/]/).filter(Boolean).pop() || path;
              const saved: Project = {
                id: project?.id ?? uid(),
                name,
                path,
                description: v.description?.trim() || undefined,
                createdAt: project?.createdAt ?? Date.now(),
                lastUsedAt: project?.lastUsedAt,
              };
              await projectStore.upsert(saved);
              await showToast({ style: Toast.Style.Success, title: project ? "Project saved" : "Project added" });
              onSaved?.(saved);
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
        defaultValue={project ? [project.path] : undefined}
      />
      <Form.TextField
        id="path"
        title="Or type a path"
        defaultValue={project?.path}
        placeholder="C:\\Users\\me\\project or ~/Developer/app"
      />
      <Form.TextField id="name" title="Name" defaultValue={project?.name} placeholder="Defaults to the folder name" />
      <Form.TextField id="description" title="Description" defaultValue={project?.description} />
    </Form>
  );
}

// ---------------------------------------------------------------- Import

export function ImportForm<T>({
  title,
  description,
  parse,
  onImport,
}: {
  title: string;
  description: string;
  parse: (raw: string) => T[];
  onImport: (items: T[]) => Promise<number>;
}) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle={title}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Import"
            icon={Icon.Download}
            onSubmit={async (v: { files: string[]; text: string }) => {
              try {
                const raw = v.files?.[0] ? readFileSync(v.files[0], "utf8") : v.text;
                if (!raw?.trim()) return void showToast({ style: Toast.Style.Failure, title: "Nothing to import" });
                const items = parse(raw);
                const n = await onImport(items);
                await showToast({ style: Toast.Style.Success, title: `Imported ${n} item(s)` });
                pop();
              } catch (e) {
                await showToast({ style: Toast.Style.Failure, title: "Import failed", message: (e as Error).message });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text={description} />
      <Form.FilePicker id="files" title="File" allowMultipleSelection={false} canChooseDirectories={false} />
      <Form.TextArea id="text" title="Or paste here" placeholder="…" />
    </Form>
  );
}
