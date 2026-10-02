import type { Edge, Node } from "@xyflow/react";
import type { Doc, Position } from "@/model/types";

/**
 * Things React Flow needs that are NOT song data, so they never go through ops:
 *  - drag:     live position while a node is being dragged (one moveNode is sent on drag stop)
 *  - selected: selected node AND edge ids in one set (edge ids contain "->", so they can't collide with node ids)
 *  - dims:     measured sizes React Flow reports; if we rebuild nodes every render without them,
 *              nodes can lose their size and flicker / stay hidden / not get edges drawn
 */
export type UiState = {
  drag: Record<string, Position>;
  selected: ReadonlySet<string>;
  dims: Record<string, { width: number; height: number }>;
};

export const emptyUi = (): UiState => ({ drag: {}, selected: new Set(), dims: {} });

/** Doc + UI state --> React Flow nodes. Nodes not in `live` (can't reach the Output) get "is-silent". */
export function toFlowNodes(doc: Doc, ui: UiState, live: ReadonlySet<string>): Node[] {
  return Object.values(doc.nodes).map((n) => {
    const size = ui.dims[n.id];
    return {
      id: n.id,
      type: n.type,
      position: ui.drag[n.id] ?? n.position,
      data: n.data as Record<string, unknown>,
      selected: ui.selected.has(n.id),
      className: live.has(n.id) ? undefined : "is-silent",
      ...(size && { measured: size }),
    };
  });
}

/** Doc + UI state --> React Flow edges (edge ids are already deterministic: "source->target") */
export function toFlowEdges(doc: Doc, ui: UiState): Edge[] {
  return Object.values(doc.edges).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    selected: ui.selected.has(e.id),
  }));
}
