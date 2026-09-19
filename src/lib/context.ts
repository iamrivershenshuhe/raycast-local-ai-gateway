import { Clipboard, getSelectedText } from "@raycast/api";
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { truncate } from "./prefs";

export async function readSelectedText(): Promise<string | undefined> {
  try {
    const t = await getSelectedText();
    return t?.trim() ? t : undefined;
  } catch {
    return undefined;
  }
}

export async function readClipboardText(): Promise<string | undefined> {
  try {
    const t = await Clipboard.readText();
    return t?.trim() ? t : undefined;
  } catch {
    return undefined;
  }
}

const TEXT_EXT =
  /\.(txt|md|markdown|json|ya?ml|toml|ini|cfg|env|csv|tsv|log|xml|html?|css|scss|js|mjs|cjs|jsx|ts|tsx|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|zsh|bash|ps1|sql|graphql|proto|dockerfile|gitignore)$/i;

export function readFileAsContext(path: string): string {
  const st = statSync(path);
  if (st.isDirectory()) return `Directory: ${path}`;
  if (!TEXT_EXT.test(path) && !/(^|[\\/])[^./\\]+$/.test(basename(path))) {
    return `File: ${path} (${st.size} bytes, binary or unsupported type; not inlined)`;
  }
  const raw = readFileSync(path, "utf8");
  return `File: ${path}\n\n\`\`\`\n${truncate(raw)}\n\`\`\``;
}

/** Wrap user-supplied context so the model can distinguish it from the instruction. */
export function withContext(instruction: string, label: string, content: string): string {
  return `${instruction.trim()}\n\n<${label}>\n${truncate(content)}\n</${label}>`;
}
