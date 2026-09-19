import { ImportForm } from "./components/Forms";
import { saveCommand } from "./lib/storage";
import type { AICommand } from "./lib/types";
import { uid } from "./lib/util";

export default function ImportAICommands() {
  return (
    <ImportForm<AICommand>
      title="Import AI Commands"
      description="A JSON array of commands (exported from Search AI Commands). Required: name, prompt. Optional: output (view|paste|replace|copy), provider, model, agentId, icon, description."
      parse={(raw) => {
        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.commands) ? parsed.commands : [parsed];
        return arr
          .filter((c: Partial<AICommand>) => c && typeof c.name === "string" && typeof c.prompt === "string")
          .map((c: Partial<AICommand>) => ({
            id: typeof c.id === "string" ? c.id : uid(),
            name: c.name!,
            prompt: c.prompt!,
            description: c.description,
            icon: c.icon,
            provider: c.provider,
            model: c.model,
            agentId: c.agentId,
            output: c.output ?? "view",
            builtIn: false,
            createdAt: c.createdAt ?? Date.now(),
            updatedAt: Date.now(),
          }));
      }}
      onImport={async (items) => {
        for (const c of items) await saveCommand(c);
        return items.length;
      }}
    />
  );
}
