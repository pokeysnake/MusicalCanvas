import { describe, expect, it } from "vitest";
import { applyOp } from "@/model/applyOp";
import { compile } from "@/model/compile";
import { emptyDoc, OUTPUT_ID } from "@/model/doc";
import type { Doc, GraphNode, Op } from "@/model/types";
import { dragHint, ordinal, playOrder, SEQ_GAP, snapPositions } from "./sequence";

const at = (x: number, y: number) => ({ x, y });
const notes = (id: string, y: number, text = "c4"): GraphNode =>
  ({ id, type: "notes", position: at(40, y), data: { name: id, text } });
const inst = (id: string, y = 0): GraphNode =>
  ({ id, type: "instrument", position: at(400, y), data: { sound: "triangle", muted: false, solo: false } });

let n = 0;
const add = (node: GraphNode): Op => ({ type: "addNode", opId: `o${++n}`, node });
const wire = (source: string, target: string): Op => ({ type: "connect", opId: `o${++n}`, source, target });

function build(ops: Op[]): Doc {
  return ops.reduce((doc, op) => {
    const r = applyOp(doc, op);
    if (!r.ok) throw new Error(r.reason);
    return r.doc;
  }, emptyDoc());
}

/** a (y=0), b (y=100), c (y=200) all into instrument i, i -> output */
const seqDoc = () => build([
  add(notes("a", 0, "c4")), add(notes("b", 100, "e4")), add(notes("c", 200, "g4")), add(inst("i")),
  wire("a", "i"), wire("b", "i"), wire("c", "i"), wire("i", OUTPUT_ID),
]);

const H = 60; // every node 60px tall
const height = () => H;

describe("playOrder", () => {
  it("is top to bottom by y", () => {
    expect(playOrder(seqDoc(), "i", {})).toEqual(["a", "b", "c"]);
  });

  it("uses live drag positions", () => {
    expect(playOrder(seqDoc(), "i", { c: at(40, -50) })).toEqual(["c", "a", "b"]);
  });

  it("matches what the compiler plays", () => {
    // c dragged to the top: after the move, compile must put g4 first, the same as playOrder says
    const doc = seqDoc();
    const moved = applyOp(doc, { type: "moveNodes", opId: "m", positions: { c: at(40, -50) } });
    if (!moved.ok) throw new Error(moved.reason);
    const { code } = compile(moved.doc);
    expect(code.indexOf("g4")).toBeLessThan(code.indexOf("c4"));
    expect(playOrder(doc, "i", { c: at(40, -50) })[0]).toBe("c");
  });
});

describe("ordinal", () => {
  it.each([[1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [11, "11th"], [12, "12th"], [13, "13th"], [21, "21st"], [22, "22nd"]])(
    "%i -> %s", (k, s) => expect(ordinal(k)).toBe(s),
  );
});

describe("dragHint", () => {
  it("says the current place when the order hasn't changed", () => {
    expect(dragHint(seqDoc(), "b", { b: at(60, 110) })).toEqual({ text: "Plays 2nd of 3 in Triangle", reorder: false });
  });

  it("flags a reorder once the drag crosses a neighbour", () => {
    const hint = dragHint(seqDoc(), "c", { c: at(40, 50) });
    expect(hint).toEqual({ text: "↕ Now plays 2nd of 3 in Triangle · release to snap", reorder: true });
  });

  it("explains that height doesn't matter for stacked nodes", () => {
    expect(dragHint(seqDoc(), "i", { i: at(0, 0) })?.text).toContain("stack");
  });

  it("explains a lone Notes", () => {
    const doc = build([add(notes("a", 0)), add(inst("i")), wire("a", "i")]);
    expect(dragHint(doc, "a", { a: at(0, 0) })?.text).toBe("Only Notes in Triangle: height doesn't matter");
  });

  it("explains an unwired Notes", () => {
    const doc = build([add(notes("a", 0))]);
    expect(dragHint(doc, "a", { a: at(0, 0) })?.text).toContain("Not playing");
  });

  it("shows nothing for the Output", () => {
    expect(dragHint(seqDoc(), OUTPUT_ID, {})).toBeNull();
  });
});

describe("snapPositions", () => {
  it("lines the column up in the new play order, starting at the old top", () => {
    // c dragged between a and b, off to the right
    const snap = snapPositions(seqDoc(), { c: at(300, 50) }, height);
    expect(snap).toEqual({
      a: at(40, 0),
      c: at(40, H + SEQ_GAP),
      b: at(40, 2 * (H + SEQ_GAP)),
    });
  });

  it("keeps the column where it was when the top node is dragged down", () => {
    const snap = snapPositions(seqDoc(), { a: at(40, 500) }, height);
    expect(snap.b).toEqual(at(40, 0));
    expect(snap.a).toEqual(at(40, 2 * (H + SEQ_GAP)));
  });

  it("uses each node's own height", () => {
    const tall = (id: string) => (id === "a" ? 200 : 50);
    const snap = snapPositions(seqDoc(), { b: at(40, 100) }, tall);
    expect(snap.b.y).toBe(200 + SEQ_GAP);
    expect(snap.c.y).toBe(200 + SEQ_GAP + 50 + SEQ_GAP);
  });

  it("leaves a whole-column drag alone", () => {
    const drag = { a: at(500, 0), b: at(500, 100), c: at(500, 200) };
    expect(snapPositions(seqDoc(), drag, height)).toEqual({});
  });

  it("ignores lone Notes and non-Notes drags", () => {
    const doc = build([add(notes("a", 0)), add(inst("i")), wire("a", "i")]);
    expect(snapPositions(doc, { a: at(9, 9) }, height)).toEqual({});
    expect(snapPositions(seqDoc(), { i: at(9, 9) }, height)).toEqual({});
  });

  it("skips a sequence with a Notes that feeds two instruments", () => {
    const doc = build([
      add(notes("a", 0)), add(notes("b", 100)), add(inst("i")), add(inst("j", 300)),
      wire("a", "i"), wire("b", "i"), wire("b", "j"),
    ]);
    expect(snapPositions(doc, { a: at(40, 200) }, height)).toEqual({});
  });
});
