import { describe, expect, it } from "vitest";
import { applyOp } from "@/model/applyOp";
import { emptyDoc, OUTPUT_ID } from "@/model/doc";
import type { Doc, GraphNode, Op } from "@/model/types";
import { partRefs } from "./partRefs";

const at = (x: number, y: number) => ({ x, y });
let n = 0;
const opId = () => `op${++n}`;
const run = (ops: Op[]): Doc => ops.reduce((d, op) => {
  const r = applyOp(d, op);
  if (!r.ok) throw new Error(r.reason);
  return r.doc;
}, emptyDoc());
const add = (node: GraphNode): Op => ({ type: "addNode", opId: opId(), node });

const notes = (id: string): GraphNode => ({ id, type: "notes", position: at(0, 0), data: { name: id, text: "c4" } });
const inst = (id: string): GraphNode => ({ id, type: "instrument", position: at(0, 0), data: { sound: "triangle", muted: false, solo: false } });
const filt = (id: string): GraphNode => ({ id, type: "filter", position: at(0, 0), data: { kind: "lpf", value: 800, q: 0.7 } });

describe("partRefs", () => {
  // each type counts on its own, in the order the parts were added; the Output is always OUT
  it("numbers each type separately in add order", () => {
    const doc = run([add(notes("a")), add(inst("b")), add(notes("c")), add(filt("d"))]);
    expect(partRefs(doc)).toEqual({ [OUTPUT_ID]: "OUT", a: "N1", b: "I1", c: "N2", d: "F1" });
  });

  // position plays no part, so dragging a node never changes its number
  it("ignores positions", () => {
    const doc = run([add(notes("a")), add(notes("b")), { type: "moveNodes", opId: opId(), positions: { a: at(500, 500) } }]);
    expect(partRefs(doc)).toMatchObject({ a: "N1", b: "N2" });
  });

  // deleting a part closes the gap: the ones added after it move down
  it("renumbers after a delete", () => {
    const doc = run([add(notes("a")), add(notes("b")), { type: "deleteElements", opId: opId(), nodeIds: ["a"], edgeIds: [] }]);
    expect(partRefs(doc)).toMatchObject({ b: "N1" });
  });
});
