import type { CompileIssue } from "@/model/compile";
import { FILTERS } from "@/model/filters";
import type { Doc } from "@/model/types";

/** "<node name>: <message>" for the top bar. The compiler says what's wrong; naming nodes is the UI's job.
 *  Notes have a user-given name; instruments and filters don't, so they get their type or filter label. */
export function issueText(doc: Doc, issue: CompileIssue): string {
  const node = doc.nodes[issue.nodeId];
  if (!node) return issue.message;
  const name =
    node.type === "notes" ? node.data.name :
    node.type === "instrument" ? "Instrument" :
    node.type === "filter" ? (Object.hasOwn(FILTERS, node.data.kind) ? FILTERS[node.data.kind].label : "Filter") :
    "Output";
  return `${name}: ${issue.message}`;
}
