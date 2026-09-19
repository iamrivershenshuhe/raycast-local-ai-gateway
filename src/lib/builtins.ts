import type { AICommand } from "./types";

const T0 = 0;

/** The 8 built-in AI Commands (mirrors Raycast's stock set). Users can edit, hide or restore them. */
export function builtInCommands(): AICommand[] {
  const mk = (
    id: string,
    name: string,
    icon: string,
    description: string,
    prompt: string,
    output: AICommand["output"] = "view",
  ): AICommand => ({
    id: `builtin.${id}`,
    name,
    icon,
    description,
    prompt,
    output,
    builtIn: true,
    createdAt: T0,
    updatedAt: T0,
  });
  return [
    mk(
      "explain",
      "Explain This",
      "💡",
      "Explain the selected text in simple terms",
      "Explain the following in clear, simple terms. If it is code, explain what it does and why.\n\n{selection}",
    ),
    mk(
      "fix-grammar",
      "Fix Spelling and Grammar",
      "✍️",
      "Correct mistakes, keep meaning and tone",
      "Fix spelling, grammar and punctuation in the text below. Keep the original meaning, tone and language. Output only the corrected text, no commentary.\n\n{selection}",
      "replace",
    ),
    mk(
      "improve",
      "Improve Writing",
      "✨",
      "Make the text clearer and more fluent",
      "Improve the writing of the text below: clearer, more concise, same meaning and language. Output only the improved text.\n\n{selection}",
      "replace",
    ),
    mk(
      "summarize",
      "Summarize",
      "📝",
      "Short summary with key points",
      "Summarize the following. Start with one sentence, then up to 5 bullet points with the key facts.\n\n{selection}",
    ),
    mk(
      "translate",
      "Translate",
      "🌐",
      "Translate to the language you specify",
      "Translate the text below to {input}. If no target language is given, translate to English if the text is not English, otherwise to Traditional Chinese. Output only the translation.\n\n{selection}",
    ),
    mk(
      "explain-code",
      "Explain Code",
      "🧩",
      "Walk through what the code does",
      "You are a senior engineer. Explain this code step by step, note any bugs or risks, and suggest improvements.\n\n```\n{selection}\n```",
    ),
    mk(
      "fix-code",
      "Fix Code",
      "🛠️",
      "Fix bugs or errors in the code",
      "Fix the problems in the code below. Return the corrected code in a single code block, followed by a short list of what you changed.\n\n```\n{selection}\n```",
    ),
    mk(
      "change-tone",
      "Change Tone",
      "🎭",
      "Rewrite in the tone you specify",
      "Rewrite the text below in a {input} tone (if none given: professional). Keep the meaning and language. Output only the rewritten text.\n\n{selection}",
      "replace",
    ),
  ];
}
