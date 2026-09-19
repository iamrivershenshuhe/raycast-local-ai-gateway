import { List } from "@raycast/api";
import { useEffect, useState } from "react";
import { RunPromptView } from "./components/RunPromptView";
import { readSelectedText } from "./lib/context";
import { truncate } from "./lib/prefs";

const PROMPT = `Fix the text below. If it is prose: correct spelling, grammar and punctuation, keep the meaning, tone and language. If it is code: fix syntax errors and obvious bugs without changing behaviour or style. Output ONLY the fixed text with no explanation, no quotes and no code fences.\n\n`;

/** Quick Fix: fix selected text and paste it back over the selection. */
export default function QuickFix() {
  const [state, setState] = useState<{ text?: string; loaded: boolean }>({ loaded: false });
  useEffect(() => {
    void readSelectedText().then((text) => setState({ text, loaded: true }));
  }, []);
  if (!state.loaded) return <List isLoading />;
  if (!state.text) {
    return (
      <List>
        <List.EmptyView title="No selected text" description="Select the text you want fixed, then run Quick Fix." />
      </List>
    );
  }
  return (
    <RunPromptView
      title="Quick Fix"
      prompt={PROMPT + truncate(state.text)}
      output="replace"
      permission="ask"
      source="command"
    />
  );
}
