import { LocalStorage } from "@raycast/api";
import type { Agent, AICommand, Automation, Conversation, Project } from "./types";
import { builtInCommands } from "./builtins";

/**
 * Tiny JSON collection layer over Raycast LocalStorage.
 * One key per collection; loaded lazily and only when a command needs it.
 */
class Collection<T extends { id: string }> {
  constructor(private key: string) {}

  async list(): Promise<T[]> {
    const raw = await LocalStorage.getItem<string>(this.key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  async save(items: T[]): Promise<void> {
    await LocalStorage.setItem(this.key, JSON.stringify(items));
  }

  async get(id: string): Promise<T | undefined> {
    return (await this.list()).find((i) => i.id === id);
  }

  async upsert(item: T): Promise<T> {
    const items = await this.list();
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx >= 0) items[idx] = item;
    else items.unshift(item);
    await this.save(items);
    return item;
  }

  async remove(id: string): Promise<void> {
    const items = await this.list();
    await this.save(items.filter((i) => i.id !== id));
  }

  async update(id: string, patch: Partial<T>): Promise<T | undefined> {
    const items = await this.list();
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return undefined;
    items[idx] = { ...items[idx], ...patch };
    await this.save(items);
    return items[idx];
  }
}

export const conversations = new Collection<Conversation>("conversations.v1");
export const agents = new Collection<Agent>("agents.v1");
export const projects = new Collection<Project>("projects.v1");
export const automations = new Collection<Automation>("automations.v1");
const customCommands = new Collection<AICommand>("commands.v1");

const MAX_CONVERSATIONS = 300;
const MAX_MESSAGE_CHARS = 60_000;

/** Save a conversation, trimming oversized content and enforcing a cap on the collection size. */
export async function saveConversation(c: Conversation): Promise<void> {
  const trimmed: Conversation = {
    ...c,
    messages: c.messages.map((m) =>
      m.content.length > MAX_MESSAGE_CHARS
        ? { ...m, content: m.content.slice(0, MAX_MESSAGE_CHARS) + "\n\n[truncated]" }
        : m,
    ),
  };
  const items = await conversations.list();
  const idx = items.findIndex((i) => i.id === c.id);
  if (idx >= 0) items[idx] = trimmed;
  else items.unshift(trimmed);
  // Keep the newest N (pinned ones are never dropped).
  if (items.length > MAX_CONVERSATIONS) {
    const pinned = items.filter((i) => i.pinned);
    const rest = items.filter((i) => !i.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
    await conversations.save([...pinned, ...rest.slice(0, MAX_CONVERSATIONS - pinned.length)]);
  } else {
    await conversations.save(items);
  }
}

export async function listCommands(): Promise<AICommand[]> {
  const custom = await customCommands.list();
  const hiddenRaw = await LocalStorage.getItem<string>("commands.hiddenBuiltins");
  const hidden = new Set<string>(hiddenRaw ? (JSON.parse(hiddenRaw) as string[]) : []);
  const overrides = new Map(custom.map((c) => [c.id, c]));
  const builtins = builtInCommands()
    .filter((b) => !hidden.has(b.id))
    .map((b) => overrides.get(b.id) ?? b);
  const extra = custom.filter((c) => !builtInCommands().some((b) => b.id === c.id));
  return [...extra, ...builtins];
}

export async function saveCommand(cmd: AICommand): Promise<void> {
  await customCommands.upsert(cmd);
}

export async function deleteCommand(id: string): Promise<void> {
  await customCommands.remove(id);
  if (builtInCommands().some((b) => b.id === id)) {
    const raw = await LocalStorage.getItem<string>("commands.hiddenBuiltins");
    const hidden = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    hidden.add(id);
    await LocalStorage.setItem("commands.hiddenBuiltins", JSON.stringify([...hidden]));
  }
}

export async function restoreBuiltInCommands(): Promise<void> {
  await LocalStorage.removeItem("commands.hiddenBuiltins");
}

// ----- simple scalar values -----

export async function getText(key: string): Promise<string> {
  return (await LocalStorage.getItem<string>(key)) ?? "";
}
export async function setText(key: string, value: string): Promise<void> {
  await LocalStorage.setItem(key, value);
}

export const KEY_PROFILE = "profile.v1";
export const KEY_MEMORY = "memory.v1";
export const KEY_MEMORY_UPDATED = "memory.updatedAt";
export const KEY_LAST_CHAT = "chat.last";
export const KEY_LAST_QUICK = "quick.last";

export async function appendMemory(fact: string): Promise<void> {
  const current = await getText(KEY_MEMORY);
  const line = `- ${fact.trim()}`;
  const next = current ? `${current.trimEnd()}\n${line}` : line;
  await setText(KEY_MEMORY, next);
  await setText(KEY_MEMORY_UPDATED, String(Date.now()));
}
