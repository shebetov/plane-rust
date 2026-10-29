// Workbench route: see core/workbench/pages/server-browser.tsx
import { observer } from "mobx-react";
import { ServerBrowser } from "@/workbench/pages/server-browser";

export default observer(function WorkbenchRoute() {
  return <ServerBrowser />;
});
