import { ImportForm } from "./components/Forms";
import { appendMemory } from "./lib/storage";

/** Import memory from a .txt/.md (one fact per line) or a JSON array/object with a `memory`/`facts` field. */
export default function ImportMemory() {
  return (
    <ImportForm<string>
      title="Import Memory"
      description="Plain text or Markdown: one fact per line. JSON: an array of strings, or an object with a `memory` string or `facts` array."
      parse={(raw) => {
        const trimmed = raw.trim();
        if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
          const j = JSON.parse(trimmed);
          if (Array.isArray(j)) return j.map(String);
          if (typeof j.memory === "string") return j.memory.split("\n");
          if (Array.isArray(j.facts)) return j.facts.map(String);
          throw new Error("Unrecognised JSON shape");
        }
        return trimmed.split("\n");
      }}
      onImport={async (lines) => {
        const facts = lines.map((l) => l.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean);
        for (const f of facts) await appendMemory(f);
        return facts.length;
      }}
    />
  );
}
