// Workbench route: see core/workbench/pages/blueprints.tsx
import { observer } from "mobx-react";
import { BlueprintsEntry } from "@/workbench/pages/blueprints";

export default observer(function WorkbenchRoute() {
  return <BlueprintsEntry />;
});
