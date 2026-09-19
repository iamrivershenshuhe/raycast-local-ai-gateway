import OpenAI from "openai";
import { prefs } from "../prefs";
import { type Provider, ProviderError, type RunOptions, type RunResult } from "./base";

export const openaiApiProvider: Provider = {
  id: "openai-api",
  name: "OpenAI API",
  kind: "api",
  defaultModel: () => prefs().openaiModel?.trim() || "gpt-5",

  async run(o: RunOptions): Promise<RunResult> {
    const key = prefs().openaiApiKey;
    if (!key) throw new ProviderError("no-api-key", "OpenAI API key not set", "Add it in the extension preferences.");
    const client = new OpenAI({ apiKey: key, maxRetries: 1 });
    const model = o.model ?? this.defaultModel()!;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (o.systemPrompt) messages.push({ role: "system", content: o.systemPrompt });
    for (const m of o.history ?? []) {
      if (!m.content.trim() || m.error) continue;
      messages.push({ role: m.role, content: m.content });
    }
    messages.push({ role: "user", content: o.prompt });

    const started = Date.now();
    let text = "";
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    try {
      const stream = await client.chat.completions.create(
        { model, messages, stream: true, stream_options: { include_usage: true } },
        { signal: o.signal },
      );
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          o.onText?.(text);
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }
      return {
        text,
        meta: {
          provider: "openai-api",
          model,
          durationMs: Date.now() - started,
          inputTokens,
          outputTokens,
          permission: "ask",
        },
      };
    } catch (e) {
      if (o.signal.aborted) throw new ProviderError("cancelled", "Cancelled");
      if (e instanceof OpenAI.AuthenticationError) throw new ProviderError("not-logged-in", "Invalid OpenAI API key");
      if (e instanceof OpenAI.RateLimitError) throw new ProviderError("quota", "OpenAI rate limit reached", e.message);
      if (e instanceof OpenAI.APIConnectionTimeoutError) throw new ProviderError("timeout", "OpenAI API timed out");
      if (e instanceof OpenAI.APIError)
        throw new ProviderError("failed", `OpenAI API error ${e.status ?? ""}`, e.message);
      throw new ProviderError("failed", (e as Error).message);
    }
  },
};
