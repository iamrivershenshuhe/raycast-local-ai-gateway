import { Action, ActionPanel, LaunchProps, List, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { freshConversation } from "./ask-ai";
import { ChatView } from "./components/ChatView";
import { readSelectedText, withContext } from "./lib/context";

export default function AskSelectedText(props: LaunchProps<{ arguments: { prompt?: string } }>) {
  const [state, setState] = useState<{ text?: string; loaded: boolean }>({ loaded: false });
  useEffect(() => {
    void readSelectedText().then((text) => {
      if (!text) void showToast({ style: Toast.Style.Failure, title: "No text selected in the frontmost app" });
      setState({ text, loaded: true });
    });
  }, []);
  if (!state.loaded) return <List isLoading />;
  if (!state.text) {
    return (
      <List>
        <List.EmptyView
          title="No selected text"
          description="Select some text in another app, then run Ask Selected Text again."
          actions={
            <ActionPanel>
              <Action
                title="Retry"
                onAction={() => readSelectedText().then((t) => setState({ text: t, loaded: true }))}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }
  const instruction = props.arguments?.prompt?.trim() || "Explain or help me with the following selected text.";
  const conv = freshConversation({ source: "chat", permission: "ask" });
  return (
    <ChatView
      initial={conv}
      autoSend={withContext(instruction, "selected_text", state.text)}
      navigationTitle="Ask Selected Text"
      includeProfile
    />
  );
}
