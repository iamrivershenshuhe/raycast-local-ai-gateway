import { Action, ActionPanel, Form, Icon, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { getText, KEY_PROFILE, setText } from "./lib/storage";

/** Profile: context prepended to every Ask AI / Quick AI / Agent conversation (not AI Commands). */
export default function Profile() {
  const [value, setValue] = useState<string | undefined>();
  useEffect(() => {
    void getText(KEY_PROFILE).then(setValue);
  }, []);
  return (
    <Form
      isLoading={value === undefined}
      navigationTitle="Profile"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Profile"
            icon={Icon.Check}
            onSubmit={async (v: { profile: string }) => {
              await setText(KEY_PROFILE, v.profile ?? "");
              await showToast({ style: Toast.Style.Success, title: "Profile saved" });
            }}
          />
          <Action
            title="Clear Profile"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            onAction={async () => {
              await setText(KEY_PROFILE, "");
              setValue("");
              await showToast({ style: Toast.Style.Success, title: "Profile cleared" });
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Context you want available in all conversations, except for AI Commands. It is added to the system prompt for every new session." />
      <Form.TextArea
        id="profile"
        title="Profile"
        value={value ?? ""}
        onChange={setValue}
        placeholder={
          "I'm River, a developer working on Raycast extensions and RAG backends.\nPrefer concise answers in Traditional Chinese with English technical terms.\nMy main stack: TypeScript, Python, Docker."
        }
      />
    </Form>
  );
}
