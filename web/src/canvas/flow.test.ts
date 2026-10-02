import { describe, expect, it } from "vitest";
import { emptyDoc, OUTPUT_ID } from "@/model/doc";
import { nodesReachingOutput } from "@/model/graph";
import { initialState, reducer, type State } from "@/model/reducer";
import type { Doc, GraphNode, Op } from "@/model/types";
import { emptyUi, toFlowEdges, toFlowNodes } from "./flow";

describe("toFlowNodes", () => {
  it("uses the drag overlay position over the Doc position", () => {
    const ui = { ...emptyUi(), drag: { [OUTPUT_ID]: { x: 5, y: 5 } } };
    const [node] = toFlowNodes(emptyDoc(), ui, new Set([OUTPUT_ID]));
    expect(node.position).toEqual({ x: 5, y: 5 });
  });

  it("marks nodes that are not live as is-silent", () => {
    const [node] = toFlowNodes(emptyDoc(), emptyUi(), new Set());
    expect(node.className).toBe("is-silent");
  });
});


/* =====================================================================
   Round trip: ops --> reducer --> Doc --> React Flow nodes/edges
   proves the canvas shows exactly what the ops built, nothing else
   ===================================================================== */
let n = 0;
const opId = () => `op${++n}`;
const at = (x: number, y: number) => ({ x, y });

/** run ops through the real reducer, failing loudly on any rejection */
function run(ops: Op[]): Doc {
  const end = ops.reduce((s: State, op) => {
    const next = reducer(s, op);
    if (next.error) throw new Error(`op ${op.type} rejected: ${next.error}`);
    return next;
  }, initialState(emptyDoc()));
  return end.doc;
}

describe("round trip: ops -> doc -> flow", () => {
  const notes: GraphNode = { id: "n", type: "notes", position: at(0, 0), data: { name: "Mel", text: "c4" } };
  const inst: GraphNode = { id: "i", type: "instrument", position: at(0, 0), data: { sound: "triangle", muted: false, solo: false } };
  const filt: GraphNode = { id: "f", type: "filter", position: at(0, 0), data: { kind: "lpf", value: 800, q: 0.7 } };
  const stray: GraphNode = { id: "s", type: "notes", position: at(9, 9), data: { name: "Stray", text: "e4" } };

  const doc = run([
    { type: "addNode", opId: opId(), node: notes },
    { type: "addNode", opId: opId(), node: inst },
    { type: "addNode", opId: opId(), node: filt },
    { type: "addNode", opId: opId(), node: stray },
    { type: "connect", opId: opId(), source: "n", target: "i" },
    { type: "connect", opId: opId(), source: "i", target: "f" },
    { type: "connect", opId: opId(), source: "f", target: OUTPUT_ID },
    { type: "connect", opId: opId(), source: "s", target: "i" },
    { type: "moveNodes", opId: opId(), positions: { n: at(10, 20), i: at(30, 40) } },
    { type: "updateNodeData", opId: opId(), id: "f", patch: { kind: "hpf", value: 200 } },
    { type: "deleteElements", opId: opId(), nodeIds: [], edgeIds: ["s->i"] }, // stray is now cut off
  ]);
  const live = nodesReachingOutput(Object.values(doc.nodes), Object.values(doc.edges));
  const nodes = toFlowNodes(doc, emptyUi(), live);
  const edges = toFlowEdges(doc, emptyUi());
  const byId = Object.fromEntries(nodes.map((x) => [x.id, x]));

  it("has exactly the nodes the ops created, with their types", () => {
    expect(nodes.map((x) => [x.id, x.type]).sort()).toEqual(
      [["f", "filter"], ["i", "instrument"], ["n", "notes"], [OUTPUT_ID, "output"], ["s", "notes"]],
    );
  });

  it("has the positions from moveNodes, untouched nodes keep theirs", () => {
    expect(byId.n.position).toEqual(at(10, 20));
    expect(byId.i.position).toEqual(at(30, 40));
    expect(byId.s.position).toEqual(at(9, 9));
  });

  it("has the data from updateNodeData, untouched fields kept", () => {
    expect(byId.f.data).toEqual({ kind: "hpf", value: 200, q: 0.7 });
    expect(byId.n.data).toEqual({ name: "Mel", text: "c4" });
  });

  it("has exactly the edges left after connect + deleteElements", () => {
    expect(edges.map((e) => [e.id, e.source, e.target]).sort()).toEqual(
      [["f->output", "f", OUTPUT_ID], ["i->f", "i", "f"], ["n->i", "n", "i"]],
    );
  });

  it("dims only the node that no longer reaches the Output", () => {
    const silent = nodes.filter((x) => x.className === "is-silent").map((x) => x.id);
    expect(silent).toEqual(["s"]);
  });
});
