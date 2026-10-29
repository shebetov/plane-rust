/**
 * The tech tree reads Plane directly with the browser's session: one call returns every
 * Item of a Blueprint with its Kits, tags, Components and relations. Writes (status and
 * "requires" links) go through Plane's own services, so Plane stays the only source.
 */
import useSWR from "swr";
import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";
import { IssueService } from "@/services/issue/issue.service";
import { IssueRelationService } from "@/services/issue/issue_relation.service";

export type TPlaneRelation = { id: string; relation_type: string; project_id: string };
export type TPlaneItem = {
  id: string;
  name: string;
  state_id: string;
  priority: string | null;
  sequence_id: number;
  project_id: string;
  parent_id: string | null;
  target_date: string | null;
  updated_at: string;
  completed_at: string | null;
  module_ids: string[];
  label_ids: string[];
  sub_issues_count: number;
  issue_relation: TPlaneRelation[];
  issue_related: TPlaneRelation[];
};
type TPage = { results: TPlaneItem[]; next_page_results: boolean; next_cursor: string };

class TreeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }
  async items(slug: string, pid: string): Promise<TPlaneItem[]> {
    const out: TPlaneItem[] = [];
    let cursor = "1000:0:0";
    for (let page = 0; page < 10; page++) {
      // pages follow each other: each needs the previous cursor
      // oxlint-disable-next-line no-await-in-loop
      const res = await this.get(`/api/workspaces/${slug}/projects/${pid}/issues-detail/`, {
        params: { expand: "issue_relation,issue_related", per_page: 1000, cursor },
      });
      const data = res.data as TPage;
      out.push(...data.results);
      if (!data.next_page_results) break;
      cursor = data.next_cursor;
    }
    return out;
  }
  async description(slug: string, pid: string, id: string): Promise<string> {
    const res = await this.get(`/api/workspaces/${slug}/projects/${pid}/issues/${id}/`);
    return (res.data?.description_html as string) ?? "";
  }
}

const tree = new TreeService();
const issues = new IssueService();
const relations = new IssueRelationService();

export const itemsKey = (pid?: string) => (pid ? `plane:tree-items:${pid}` : null);

export const usePlaneItems = (slug: string, pid?: string) =>
  useSWR<TPlaneItem[]>(itemsKey(pid), () => tree.items(slug, pid!), {
    revalidateOnFocus: true,
    dedupingInterval: 3000,
  });

export const useDescription = (slug: string, pid?: string, id?: string | null) =>
  useSWR<string>(pid && id ? `plane:desc:${id}` : null, () => tree.description(slug, pid!, id!), {
    revalidateOnFocus: false,
  });

export const setItemState = (slug: string, pid: string, id: string, stateId: string) =>
  issues.patchIssue(slug, pid, id, { state_id: stateId });

/** `item` can't be crafted until `blocker` is: Plane's "blocked by" relation */
export const addRequirement = (slug: string, pid: string, item: string, blocker: string) =>
  relations.createIssueRelations(slug, pid, item, { relation_type: "blocked_by", issues: [blocker] });

export const removeRequirement = (slug: string, pid: string, item: string, blocker: string) =>
  relations.deleteIssueRelation(slug, pid, item, { relation_type: "blocked_by", related_issue: blocker });

/** Plain text from Plane's description HTML (for the research panel). */
export function plainText(html: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("sub").forEach((n) => n.remove()); // "Imported from Linear" footers
  return (doc.body.textContent ?? "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
