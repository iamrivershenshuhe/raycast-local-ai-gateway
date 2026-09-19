import Anthropic from "@anthropic-ai/sdk";
import { prefs } from "../prefs";
import { type Provider, ProviderError, type RunOptions, type RunResult } from "./base";

export const anthropicApiProvider: Provider = {
  id: "anthropic-api",
  name: "Anthropic API",
  kind: "api",
  defaultModel: () => prefs().anthropicModel?.trim() || "claude-opus-5",

  async run(o: RunOptions): Promise<RunResult> {
    const key = prefs().anthropicApiKey;
    if (!key)
      throw new ProviderError("no-api-key", "Anthropic API key not set", "Add it in the extension preferences.");
    const client = new Anthropic({ apiKey: key, maxRetries: 1 });
    const model = o.model ?? this.defaultModel()!;

    const messages: Anthropic.MessageParam[] = [];
    for (const m of o.history ?? []) {
      if (!m.content.trim() || m.error) continue;
      messages.push({ role: m.role, content: m.content });
    }
    messages.push({ role: "user", content: o.prompt });

    const started = Date.now();
    let text = "";
    try {
      const stream = client.messages.stream(
        {
          model,
          max_tokens: 16000,
          ...(o.systemPrompt ? { system: o.systemPrompt } : {}),
          messages,
        },
        { signal: o.signal },
      );
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          text += event.delta.text;
          o.onText?.(text);
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        throw new ProviderError("failed", "The request was declined by the model's safety system.");
      }
      return {
        text,
        meta: {
          provider: "anthropic-api",
          model,
          durationMs: Date.now() - started,
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
          permission: "ask",
        },
      };
    } catch (e) {
      if (o.signal.aborted) throw new ProviderError("cancelled", "Cancelled");
      if (e instanceof ProviderError) throw e;
      if (e instanceof Anthropic.AuthenticationError)
        throw new ProviderError("not-logged-in", "Invalid Anthropic API key");
      if (e instanceof Anthropic.RateLimitError)
        throw new ProviderError("quota", "Anthropic rate limit reached", e.message);
      if (e instanceof Anthropic.APIConnectionTimeoutError)
        throw new ProviderError("timeout", "Anthropic API timed out");
      if (e instanceof Anthropic.APIError)
        throw new ProviderError("failed", `Anthropic API error ${e.status ?? ""}`, e.message);
      throw new ProviderError("failed", (e as Error).message);
    }
  },
};
