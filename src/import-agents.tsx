import { ImportForm } from "./components/Forms";
import { agents as store } from "./lib/storage";
import type { Agent } from "./lib/types";
import { uid } from "./lib/util";

export default function ImportAgents() {
  return (
    <ImportForm<Agent>
      title="Import Agents"
      description="A JSON array of agents, e.g. exported from Search Agents. Required field: name. Optional: instructions, provider, model, permission, cwd, icon, description."
      parse={(raw) => {
        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.agents) ? parsed.agents : [parsed];
        return arr
          .filter((a: Partial<Agent>) => a && typeof a.name === "string")
          .map((a: Partial<Agent>) => ({
            id: typeof a.id === "string" ? a.id : uid(),
            name: a.name!,
            description: a.description,
            icon: a.icon,
            instructions: a.instructions ?? "",
            provider: a.provider,
            model: a.model,
            permission: a.permission,
            cwd: a.cwd,
            createdAt: a.createdAt ?? Date.now(),
            updatedAt: Date.now(),
          }));
      }}
      onImport={async (items) => {
        for (const a of items) await store.upsert(a);
        return items.length;
      }}
    />
  );
}
