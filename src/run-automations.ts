import { environment, LaunchType, showToast, Toast, updateCommandMetadata } from "@raycast/api";
import { isDue, runAutomation } from "./lib/automations";
import { automations as store } from "./lib/storage";

/**
 * Background runner (interval: 15m). Cheap when nothing is due: one LocalStorage read, no processes.
 * Due automations run sequentially so at most one CLI process exists at a time.
 */
export default async function RunAutomations() {
  const all = await store.list();
  const due = all.filter((a) => isDue(a));
  const manual = environment.launchType === LaunchType.UserInitiated;

  if (due.length === 0) {
    await updateCommandMetadata({ subtitle: `${all.filter((a) => a.enabled).length} enabled · nothing due` });
    if (manual) await showToast({ style: Toast.Style.Success, title: "No automations due" });
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const a of due) {
    const r = await runAutomation(a);
    if (r.lastError) failed++;
    else ok++;
  }
  await updateCommandMetadata({
    subtitle: `last run ${new Date().toLocaleTimeString()} · ${ok} ok${failed ? ` · ${failed} failed` : ""}`,
  });
  if (manual) {
    await showToast({
      style: failed ? Toast.Style.Failure : Toast.Style.Success,
      title: `Ran ${due.length} automation(s)`,
      message: failed ? `${failed} failed — see Manage Automations` : undefined,
    });
  }
}
