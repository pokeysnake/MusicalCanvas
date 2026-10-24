import type { Op, Position } from "@/model/types";

/**
 * Turns one React Flow gesture into exactly ONE op (the gate: one user action = one op).
 * Pure so the gate can be tested without simulating a drag in a browser.
 */

/** drag stop: every dragged node (one or many) goes into a single moveNodes op */
export function moveOp(dragged: { id: string; position: Position }[]): Op {
  return {
    type: "moveNodes",
    opId: crypto.randomUUID(),
    positions: Object.fromEntries(dragged.map((n) => [n.id, n.position])),
  };
}

/** delete key: selected nodes + edges go into a single deleteElements op
 *  (edges attached to deleted nodes may be included; the op removes those anyway) */
export function deleteOp(nodes: { id: string }[], edges: { id: string }[]): Op {
  return {
    type: "deleteElements",
    opId: crypto.randomUUID(),
    nodeIds: nodes.map((n) => n.id),
    edgeIds: edges.map((e) => e.id),
  };
}

/** BPM box blur/Enter: the typed text becomes one setSetting op, or null when there's nothing to send
 *  (empty, not a number, or unchanged). The 40-240 range is left to applyOp so the rule lives in one place. */
export function bpmOp(text: string, current: number): Op | null {
  const bpm = Number(text);
  if (text.trim() === "" || !Number.isFinite(bpm) || bpm === current) return null;
  return { type: "setSetting", opId: crypto.randomUUID(), patch: { bpm } };
}
