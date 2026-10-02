import { describe, expect, it } from "vitest";
import { emptyDoc, OUTPUT_ID } from "@/model/doc";
import { initialState, reducer } from "@/model/reducer";
import type { Doc, GraphNode, Op } from "@/model/types";
import { deleteOp, moveOp } from "./ops";

/* the gate: one user action = one op. These are the exact builders the drag-stop and delete handlers call. */

const at = (x: number, y: number) => ({ x, y });
const notes = (id: string): GraphNode => ({ id, type: "notes", position: at(0, 0), data: { name: id, text: "c4" } });
const inst = (id: string): GraphNode => ({ id, type: "instrument", position: at(0, 0), data: { sound: "triangle", muted: false, solo: false } });

/** a doc with a, b (notes), i (instrument), a->i, i->output */
function startDoc(): Doc {
  const ops: Op[] = [
    { type: "addNode", opId: "1", node: notes("a") },
    { type: "addNode", opId: "2", node: notes("b") },
    { type: "addNode", opId: "3", node: inst("i") },
    { type: "connect", opId: "4", source: "a", target: "i" },
    { type: "connect", opId: "5", source: "i", target: OUTPUT_ID },
  ];
  return ops.reduce(reducer, initialState(emptyDoc())).doc;
}

describe("one drag = one op", () => {
  it("dragging one node sends one moveNodes op", () => {
    const op = moveOp([{ id: "a", position: at(5, 5) }]);
    const next = reducer(initialState(startDoc()), op);
    expect(next.error).toBeNull();
    expect(next.doc.nodes.a.position).toEqual(at(5, 5));
  });

  it("dragging three selected nodes still sends ONE op that moves all three", () => {
    const dragged = [
      { id: "a", position: at(1, 1) },
      { id: "b", position: at(2, 2) },
      { id: "i", position: at(3, 3) },
    ];
    const op = moveOp(dragged);
    expect(op.type).toBe("moveNodes");

    const next = reducer(initialState(startDoc()), op);
    expect(next.error).toBeNull();
    for (const d of dragged) expect(next.doc.nodes[d.id].position).toEqual(d.position);
  });
});

describe("one delete = one op", () => {
  it("deleting a node plus the edges React Flow attaches to it is ONE op that is accepted", () => {
    // React Flow hands onDelete the node AND its connected edges; the old per-item approach
    // sent a disconnect for an edge deleteNode had already removed, which got rejected
    const op = deleteOp([{ id: "a" }], [{ id: "a->i" }]);
    const next = reducer(initialState(startDoc()), op);
    expect(next.error).toBeNull();
    expect(next.doc.nodes.a).toBeUndefined();
    expect(next.doc.edges["a->i"]).toBeUndefined();
  });

  it("box-select delete of several nodes and an unrelated edge is ONE op", () => {
    const op = deleteOp([{ id: "a" }, { id: "b" }], [{ id: "a->i" }, { id: `i->${OUTPUT_ID}` }]);
    const next = reducer(initialState(startDoc()), op);
    expect(next.error).toBeNull();
    expect(Object.keys(next.doc.nodes).sort()).toEqual(["i", OUTPUT_ID]);
    expect(next.doc.edges).toEqual({});
  });
});
