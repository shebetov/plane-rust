// Workbench route: see core/workbench/pages/tech-tree.tsx
import { observer } from "mobx-react";
import { TechTree } from "@/workbench/pages/tech-tree";

export default observer(function WorkbenchRoute() {
  return <TechTree />;
});
