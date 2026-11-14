import type { CSSProperties } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { Doc, Position } from "@/model/types";
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

/** colours for other people's drag claims; no red, that's the Output and the selection colour */
export const CLAIM_COLORS = ["#f2b84b", "#4fc3d9", "#7bd88f", "#b392f0"];

/** the same client always gets the same colour, on every screen (a small string hash, no shared state) */
export function claimColor(clientId: string): string {
  let h = 0;
  for (const ch of clientId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CLAIM_COLORS[h % CLAIM_COLORS.length];
}

/** the claims map minus my own claims, as nodeId -> colour of whoever holds it */
export function heldByOthers(claims: Record<string, string>, me: string | null): Record<string, string> {
  return Object.fromEntries(
    Object.entries(claims).filter(([, who]) => who !== me).map(([id, who]) => [id, claimColor(who)]),
  );
}

/** prefix for cat group frame ids, so they can never clash with Doc node ids */
export const GROUP_PREFIX = "cat:";

/**
 * Doc + UI state --> React Flow nodes. Nodes not in `live` (can't reach the Output) get "is-silent".
 * Cat group frames come first (drawn behind everything); a Notes inside a group gets `seq` = its play number.
 * held = nodes someone ELSE is dragging (nodeId -> their colour): those can't be grabbed and get an "is-claimed"
 * outline, and so can't the frames around them (a frame drag would move them too).
 */
export function toFlowNodes(
  doc: Doc, ui: UiState, live: ReadonlySet<string>, groups: CatGroup[] = [], held: Record<string, string> = {},
): Node[] {
  const seq: Record<string, number> = {};
  for (const g of groups) g.order.forEach((id, i) => { seq[id] ??= i + 1; });

  const frames: Node[] = groups.map((g) => ({
    id: GROUP_PREFIX + g.instrumentId,
    type: "catGroup",
    position: { x: g.box.x, y: g.box.y },
    width: g.box.width,
    height: g.box.height,
    data: { label: g.label, members: g.members },
    draggable: !g.order.some((id) => id in held),
    dragHandle: ".cat-group__tab", // only the label tab grabs the group; the rest of the frame is click-through
    selectable: false,
    focusable: false,
    deletable: false,
    connectable: false,
    zIndex: -1,
  }));

  return [...frames, ...Object.values(doc.nodes).map((n) => {
    const size = ui.dims[n.id];
    const silent = live.has(n.id) ? undefined : "is-silent";
    const color = held[n.id];
    return {
      id: n.id,
      type: n.type,
      position: ui.drag[n.id] ?? n.position,
      data: (n.id in seq ? { ...n.data, seq: seq[n.id] } : n.data) as Record<string, unknown>,
      selected: ui.selected.has(n.id),
      className: silent,
      ...(size && { measured: size }),
      // --claim colours the dashed outline and the "moving" tag (globals.css .is-claimed)
      ...(color && {
        className: silent ? `${silent} is-claimed` : "is-claimed",
        draggable: false,
        style: { "--claim": color } as CSSProperties,
      }),
    };
  })];
}

/**
 * Doc + UI state --> React Flow edges (edge ids are already deterministic: "source->target").
 * Drawn as schematic wires (CableEdge). bus = the target has 2+ inputs, so its wires merge into one line going in.
 */
export function toFlowEdges(doc: Doc, ui: UiState): Edge[] {
  const edges = Object.values(doc.edges);
  const inputs: Record<string, number> = {};
  for (const e of edges) inputs[e.target] = (inputs[e.target] ?? 0) + 1;

  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    selected: ui.selected.has(e.id),
    type: "cable",
    data: { bus: inputs[e.target] > 1 },
  }));
}
