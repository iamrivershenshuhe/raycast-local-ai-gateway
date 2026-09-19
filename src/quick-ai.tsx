import { LaunchProps } from "@raycast/api";
import { freshConversation } from "./ask-ai";
import { ChatView } from "./components/ChatView";
import { KEY_LAST_QUICK } from "./lib/storage";

/** Quick AI: same chat UI, but starts fresh every time and is filed under "Quick AI" in history. */
export default function QuickAI(props: LaunchProps<{ arguments: { query: string } }>) {
  const conv = freshConversation({ source: "quick", permission: "ask" });
  return (
    <ChatView
      initial={conv}
      autoSend={props.arguments.query}
      rememberKey={KEY_LAST_QUICK}
      navigationTitle="Quick AI"
      includeProfile
    />
  );
}
