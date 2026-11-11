import type { Edge, Node } from "@xyflow/react";
import type { Doc, NodeType, Position } from "@/model/types";
import type { CatGroup } from "./sequence";

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

/** prefix for cat group frame ids, so they can never clash with Doc node ids */
export const GROUP_PREFIX = "cat:";

/**
 * Doc + UI state --> React Flow nodes. Nodes not in `live` (can't reach the Output) get "is-silent".
 * Cat group frames come first (drawn behind everything); a Notes inside a group gets `seq` = its play number.
 */
export function toFlowNodes(doc: Doc, ui: UiState, live: ReadonlySet<string>, groups: CatGroup[] = []): Node[] {
  const seq: Record<string, number> = {};
  for (const g of groups) g.order.forEach((id, i) => { seq[id] ??= i + 1; });

  const frames: Node[] = groups.map((g) => ({
    id: GROUP_PREFIX + g.instrumentId,
    type: "catGroup",
    position: { x: g.box.x, y: g.box.y },
    width: g.box.width,
    height: g.box.height,
    data: { label: g.label, members: g.members },
    draggable: true,
    dragHandle: ".cat-group__tab", // only the label tab grabs the group; the rest of the frame is click-through
    selectable: false,
    focusable: false,
    deletable: false,
    connectable: false,
    zIndex: -1,
  }));

  return [...frames, ...Object.values(doc.nodes).map((n) => {
    const size = ui.dims[n.id];
    return {
      id: n.id,
      type: n.type,
      position: ui.drag[n.id] ?? n.position,
      data: (n.id in seq ? { ...n.data, seq: seq[n.id] } : n.data) as Record<string, unknown>,
      selected: ui.selected.has(n.id),
      className: live.has(n.id) ? undefined : "is-silent",
      ...(size && { measured: size }),
    };
  })];
}

/** the colour each node type puts on its cables (theme tokens from globals.css) */
export const CABLE_COLOR: Record<NodeType, string> = {
  notes: "var(--notes)",
  instrument: "var(--instrument)",
  filter: "var(--filter)",
  fx: "var(--filter)",
  output: "var(--output)",
};

/**
 * Doc + UI state --> React Flow edges (edge ids are already deterministic: "source->target").
 * Drawn as patch cables (CableEdge) that fade from the source node's colour to the target's.
 */
export function toFlowEdges(doc: Doc, ui: UiState): Edge[] {
  return Object.values(doc.edges).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    selected: ui.selected.has(e.id),
    type: "cable",
    data: {
      from: CABLE_COLOR[doc.nodes[e.source]?.type ?? "output"],
      to: CABLE_COLOR[doc.nodes[e.target]?.type ?? "output"],
    },
  }));
}
