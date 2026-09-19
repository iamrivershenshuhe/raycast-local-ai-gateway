import { LaunchProps, List } from "@raycast/api";
import { useEffect, useState } from "react";
import { freshConversation } from "./ask-ai";
import { ChatView } from "./components/ChatView";
import { readClipboardText, withContext } from "./lib/context";

export default function AskClipboard(props: LaunchProps<{ arguments: { prompt?: string } }>) {
  const [state, setState] = useState<{ text?: string; loaded: boolean }>({ loaded: false });
  useEffect(() => {
    void readClipboardText().then((text) => setState({ text, loaded: true }));
  }, []);
  if (!state.loaded) return <List isLoading />;
  if (!state.text) {
    return (
      <List>
        <List.EmptyView title="Clipboard is empty" description="Copy some text first, then run Ask Clipboard again." />
      </List>
    );
  }
  const instruction = props.arguments?.prompt?.trim() || "Explain or help me with the following clipboard contents.";
  const conv = freshConversation({ source: "chat", permission: "ask" });
  return (
    <ChatView
      initial={conv}
      autoSend={withContext(instruction, "clipboard", state.text)}
      navigationTitle="Ask Clipboard"
      includeProfile
    />
  );
}
