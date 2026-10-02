import { describe, it, expect } from "vitest";
import { applyOp } from "./applyOp";
import { emptyDoc, OUTPUT_ID } from "./doc";
import { nodesReachingOutput } from "./graph";
import { edgeId } from "./types";
import type { Doc, GraphNode, Op } from "./types";

/* =====================================================================
   Helpers
   ===================================================================== */

/* ---------- builders: make nodes and ops in one line ---------- */
let opCounter = 0;
const opId = () => `op${++opCounter}`;

const notes = (id: string): GraphNode =>
  ({ id, type: "notes", position: { x: 0, y: 0 }, data: { name: id, text: "c4" } });
const instrument = (id: string): GraphNode =>
  ({ id, type: "instrument", position: { x: 0, y: 0 }, data: { sound: "triangle", muted: false, solo: false } });
const filter = (id: string): GraphNode =>
  ({ id, type: "filter", position: { x: 0, y: 0 }, data: { kind: "lpf", value: 800, q: 0.7 } });

const add = (node: GraphNode): Op => ({ type: "addNode", opId: opId(), node });
const connect = (source: string, target: string): Op => ({ type: "connect", opId: opId(), source, target });
const del = (nodeIds: string[], edgeIds: string[] = []): Op => ({ type: "deleteElements", opId: opId(), nodeIds, edgeIds });

/* ---------- apply helpers ---------- */
// apply an op that MUST succeed; fail the test loudly if it's rejected
function mustApply(doc: Doc, op: Op): Doc {
  const r = applyOp(doc, op);
  if (!r.ok) throw new Error(`expected ok, got rejected: ${r.reason}`);
  return r.doc;
}

// apply a list of ops in order (same pattern the server will use to replay an op log)
const applyAll = (doc: Doc, ops: Op[]) => ops.reduce(mustApply, doc);

// apply an op that MUST be rejected; return the reason
function mustReject(doc: Doc, op: Op): string {
  const r = applyOp(doc, op);
  if (r.ok) throw new Error("expected rejection, but the op was applied");
  return r.reason;
}

/* ---------- a ready-made chain: n (notes) -> i (instrument) -> f (lpf) -> output ---------- */
const chainDoc = () => applyAll(emptyDoc(), [
  add(notes("n")), add(instrument("i")), add(filter("f")),
  connect("n", "i"), connect("i", "f"), connect("f", OUTPUT_ID),
]);

/* ---------- freeze an object and everything inside it; any write then throws ---------- */
function deepFreeze<T>(obj: T): T {
  Object.values(obj as object).forEach((v) => {
    if (v && typeof v === "object") deepFreeze(v);
  });
  return Object.freeze(obj);
}


/* =====================================================================
   Happy paths: one per op
   ===================================================================== */
describe("applyOp: happy paths", () => {
  it("addNode adds the node", () => {
    const doc = mustApply(emptyDoc(), add(notes("n1")));
    expect(doc.nodes.n1.type).toBe("notes");
  });

  it("moveNodes changes the position", () => {
    const doc = mustApply(chainDoc(), { type: "moveNodes", opId: opId(), positions: { n: { x: 50, y: 75 } } });
    expect(doc.nodes.n.position).toEqual({ x: 50, y: 75 });
  });

  it("moveNodes moves several nodes in one op", () => {
    const doc = mustApply(chainDoc(), {
      type: "moveNodes", opId: opId(), positions: { n: { x: 1, y: 2 }, i: { x: 3, y: 4 } },
    });
    expect(doc.nodes.n.position).toEqual({ x: 1, y: 2 });
    expect(doc.nodes.i.position).toEqual({ x: 3, y: 4 });
    expect(doc.nodes.f.position).toEqual({ x: 0, y: 0 }); // not in the op, untouched
  });

  it("updateNodeData changes one field and keeps the others", () => {
    const doc = mustApply(chainDoc(), { type: "updateNodeData", opId: opId(), id: "f", patch: { value: 900 } });
    const f = doc.nodes.f;
    expect(f.type).toBe("filter");
    if (f.type === "filter") {
      expect(f.data.value).toBe(900);
      expect(f.data.kind).toBe("lpf"); // unchanged
      expect(f.data.q).toBe(0.7);      // unchanged
    }
  });

  it("connect adds an edge with a deterministic id", () => {
    const doc = applyAll(emptyDoc(), [add(notes("n")), add(instrument("i")), connect("n", "i")]);
    expect(doc.edges["n->i"]).toEqual({ id: "n->i", source: "n", target: "i" });
  });

  it("deleteElements removes an edge", () => {
    const doc = mustApply(chainDoc(), del([], ["n->i"]));
    expect(doc.edges["n->i"]).toBeUndefined();
  });

  it("deleteElements removes a node", () => {
    const doc = mustApply(chainDoc(), del(["n"]));
    expect(doc.nodes.n).toBeUndefined();
  });

  it("setSetting changes the bpm", () => {
    const doc = mustApply(emptyDoc(), { type: "setSetting", opId: opId(), patch: { bpm: 90 } });
    expect(doc.settings.bpm).toBe(90);
  });
});


/* =====================================================================
   Rejections: one row per rule
   ===================================================================== */
describe("applyOp: rejections", () => {
  it.each<[string, Op, string]>([
    // [ description,                  op,                                                                          reason contains ]
    ["connect to a missing node",      connect("n", "ghost"),                                                      "does not exist"],
    ["notes straight to a filter",     connect("n", "f"),                                                          "cannot connect"],
    ["a duplicate cable",              connect("i", "f"),                                                          "duplicate"],
    ["a node to itself",               connect("f", "f"),                                                          ""],
    ["adding a second Output",         add({ id: "o2", type: "output", position: { x: 0, y: 0 }, data: {} }),     "exactly one Output"],
    ["adding a duplicate id",          add(notes("n")),                                                            "already exists"],
    ["deleting the Output",            del([OUTPUT_ID]),                                                           "cannot be deleted"],
    ["the Output inside a batch",      del(["n", OUTPUT_ID]),                                                      "cannot be deleted"],
    ["a delete with nothing in it",    del([], []),                                                                "nothing to delete"],
    ["moving a missing node",          { type: "moveNodes", opId: "x", positions: { ghost: { x: 1, y: 1 } } },    "does not exist"],
    ["a move with no nodes",           { type: "moveNodes", opId: "x", positions: {} },                           "no nodes"],
    ["updating a missing node",        { type: "updateNodeData", opId: "x", id: "ghost", patch: { value: 1 } },   "does not exist"],
    ["a field from another node type", { type: "updateNodeData", opId: "x", id: "f", patch: { sound: "square" } }, "no field"],
    ["an instrument with an unknown sound", add({ id: "i2", type: "instrument", position: { x: 0, y: 0 }, data: { sound: "sawtooth", muted: false, solo: false } }), "unknown sound"],
    ["switching to an unknown sound",  { type: "updateNodeData", opId: "x", id: "i", patch: { sound: "gm_piano" } }, "unknown sound"],
    ["bpm too high",                   { type: "setSetting", opId: "x", patch: { bpm: 999 } },                    "bpm"],
    ["bpm too low",                    { type: "setSetting", opId: "x", patch: { bpm: 10 } },                     "bpm"],
  ])("rejects %s", (_desc, op, reason) => {
    const why = mustReject(chainDoc(), op);
    expect(why).toContain(reason);
  });
});


/* =====================================================================
   Cycles: the trickiest rule
   ===================================================================== */
describe("applyOp: cycles", () => {
  it("rejects a 2-filter loop", () => {
    const doc = applyAll(emptyDoc(), [add(filter("a")), add(filter("b")), connect("a", "b")]);
    expect(mustReject(doc, connect("b", "a"))).toContain("cycle");
  });

  it("rejects a 3-filter loop", () => {
    const doc = applyAll(emptyDoc(), [
      add(filter("a")), add(filter("b")), add(filter("c")),
      connect("a", "b"), connect("b", "c"),
    ]);
    expect(mustReject(doc, connect("c", "a"))).toContain("cycle");
  });

  it("allows a diamond (two paths to one node is NOT a loop)", () => {
    // i -> a -> output  and  i -> b -> output
    const doc = applyAll(emptyDoc(), [
      add(instrument("i")), add(filter("a")), add(filter("b")),
      connect("i", "a"), connect("i", "b"),
      connect("a", OUTPUT_ID), connect("b", OUTPUT_ID),
    ]);
    expect(Object.keys(doc.edges)).toHaveLength(4);
  });

  it("allows a long chain of filters", () => {
    const doc = applyAll(emptyDoc(), [
      add(instrument("i")), add(filter("a")), add(filter("b")), add(filter("c")),
      connect("i", "a"), connect("a", "b"), connect("b", "c"), connect("c", OUTPUT_ID),
    ]);
    expect(doc.edges[edgeId("c", OUTPUT_ID)]).toBeDefined();
  });
});


/* =====================================================================
   Purity: the input doc is never modified
   ===================================================================== */
describe("applyOp: purity", () => {
  it("never modifies the input doc (frozen doc, every op type)", () => {
    const doc = deepFreeze(chainDoc());
    expect(() => {
      applyOp(doc, { type: "moveNodes", opId: "x", positions: { n: { x: 9, y: 9 } } });
      applyOp(doc, { type: "updateNodeData", opId: "x", id: "f", patch: { value: 900 } });
      applyOp(doc, del(["i"]));
      applyOp(doc, del([], ["n->i"]));
      applyOp(doc, { type: "setSetting", opId: "x", patch: { eq: { low: 3, mid: 0, high: 0 } } });
      applyOp(doc, add(notes("new")));
      applyOp(doc, connect("new", "i")); // rejected ("new" isn't in this doc), still must not mutate
    }).not.toThrow();
  });

  it("leaves the old doc identical after a change (snapshot)", () => {
    const doc = chainDoc();
    const before = structuredClone(doc);
    mustApply(doc, del(["i"]));
    expect(doc).toEqual(before);
  });

  it("a moveNodes with one missing id moves nothing", () => {
    const doc = chainDoc();
    const before = structuredClone(doc);
    mustReject(doc, { type: "moveNodes", opId: "x", positions: { n: { x: 9, y: 9 }, ghost: { x: 1, y: 1 } } });
    expect(doc).toEqual(before);
  });

  it("a delete that includes the Output deletes nothing", () => {
    const doc = chainDoc();
    const before = structuredClone(doc);
    mustReject(doc, del(["n", OUTPUT_ID]));
    expect(doc).toEqual(before);
  });

  it("a rejected op leaves no partial changes", () => {
    const doc = chainDoc();
    const before = structuredClone(doc);
    mustReject(doc, connect("f", "i")); // would create a loop i -> f -> i
    expect(doc).toEqual(before);
  });
});


/* =====================================================================
   Side effects: the "remember to also..." behavior
   ===================================================================== */
describe("applyOp: side effects", () => {
  it("deleteElements skips ids that are already gone (someone else deleted them first)", () => {
    const doc = mustApply(chainDoc(), del(["ghost", "n"], ["a->b"]));
    expect(doc.nodes.n).toBeUndefined();
    expect(Object.keys(doc.nodes)).toHaveLength(3); // i, f, output
  });

  it("deleteElements with only missing ids succeeds and changes nothing", () => {
    const start = chainDoc();
    const doc = mustApply(start, del(["ghost"], ["a->b"]));
    expect(doc).toEqual(start);
  });

  it("deleteElements removes nodes and unrelated edges in one op", () => {
    const doc = mustApply(chainDoc(), del(["n"], [edgeId("f", OUTPUT_ID)]));
    expect(doc.nodes.n).toBeUndefined();
    expect(doc.edges["n->i"]).toBeUndefined();               // attached to n
    expect(doc.edges[edgeId("f", OUTPUT_ID)]).toBeUndefined(); // named directly
    expect(doc.edges["i->f"]).toBeDefined();                 // untouched
  });

  it("deleting a node removes every edge touching it", () => {
    const doc = mustApply(chainDoc(), del(["i"]));
    expect(doc.edges["n->i"]).toBeUndefined();
    expect(doc.edges["i->f"]).toBeUndefined();
    expect(doc.edges[edgeId("f", OUTPUT_ID)]).toBeDefined(); // unrelated edge survives
  });

  it("an EQ patch keeps the other bands", () => {
    const doc = mustApply(emptyDoc(), {
      type: "setSetting", opId: "x", patch: { eq: { low: 3 } as Doc["settings"]["eq"] },
    });
    expect(doc.settings.eq).toEqual({ low: 3, mid: 0, high: 0 });
  });

  it("a setSetting without bpm keeps the bpm", () => {
    const doc = mustApply(emptyDoc(), {
      type: "setSetting", opId: "x", patch: { eq: { low: 1, mid: 2, high: 3 } },
    });
    expect(doc.settings.bpm).toBe(120);
  });

  it("after deleting the instrument, its notes node no longer reaches Output", () => {
    const before = chainDoc();
    expect(nodesReachingOutput(Object.values(before.nodes), Object.values(before.edges)).has("n")).toBe(true);

    const after = mustApply(before, del(["i"]));
    expect(nodesReachingOutput(Object.values(after.nodes), Object.values(after.edges)).has("n")).toBe(false);
  });
});


/* =====================================================================
   Sequences: several ops in a row
   ===================================================================== */
describe("applyOp: sequences", () => {
  it("builds the mockup graph: 3 notes -> 3 instruments -> 1 filter -> output", () => {
    const doc = applyAll(emptyDoc(), [
      add(notes("n1")), add(notes("n2")), add(notes("n3")),
      add(instrument("i1")), add(instrument("i2")), add(instrument("i3")),
      add(filter("f")),
      connect("n1", "i1"), connect("n2", "i2"), connect("n3", "i3"),
      connect("i1", "f"), connect("i2", "f"), connect("i3", "f"),
      connect("f", OUTPUT_ID),
    ]);

    expect(Object.keys(doc.nodes)).toHaveLength(8);  // 7 added + Output
    expect(Object.keys(doc.edges)).toHaveLength(7);

    const live = nodesReachingOutput(Object.values(doc.nodes), Object.values(doc.edges));
    expect(live.size).toBe(8); // everything is connected
  });

  it("disconnecting then reconnecting returns to the same edges", () => {
    const start = chainDoc();
    const end = applyAll(start, [
      del([], ["i->f"]),
      connect("i", "f"),
    ]);
    expect(end.edges).toEqual(start.edges);
  });
});