import { describe, it, expect } from "vitest";
import { compile } from "./compile";
import { emptyDoc, OUTPUT_ID } from "./doc";
import { edgeId } from "./types";
import type { Doc, GraphNode, InstrumentData } from "./types";
import type { FilterKind } from "./filters";

/** Builders: one line per node */
const at = (y: number) => ({ x: 0, y });

const notes = (id: string, text: string, y = 0): GraphNode => ({
  id,
  type: "notes",
  position: at(y),
  data: { name: id, text },
})

const inst = (
  id: string,
  sound: string,
  extra: Partial<InstrumentData> = {},
): GraphNode => ({
  id,
  type: "instrument",
  position: at(0),
  data: { sound, muted: false, solo: false, ...extra },
});

const filter = (
  id: string,
  kind: FilterKind,
  value: number,
  q = 0.7,
): GraphNode => ({
  id,
  type: "filter",
  position: at(0),
  data: { kind, value, q },
});

const OUT = OUTPUT_ID;


// a doc from nodes + [source, target] pairs --> skips applyOp on purpose to test compiler alone
function docOf(nodes:GraphNode[], links: [string, string][]): Doc {
    const doc = emptyDoc();
    for (const n of nodes) doc.nodes[n.id] = n;
    for(const [s,t] of links) doc.edges[edgeId(s,t)] = {id: edgeId(s,t), source: s, target: t};
    return doc;
}

// expected code: the BPM line plus the given lines
const code = (...lines: string[]) => ["setcpm(120/4)", ...lines].join("\n");

/**
 *  what each part does
 * - at(y) makes a position only y matters to the compiler for ordering, so x is always 0
 * - notes, inst, and filter build one node each in a single line, like the builders in applyOp.test.ts --> y = 0 and q = 0.7
 *   are defaults so tests can skip them
 * - extra: Partial<InstrumentData> lets a test write inst("i1", "saw", { muted: true }) and override only that field
 *      ...extra comes last to replace the default
 * - docOf starts from emptyDoc() so we get the real output node and default bpm of 120, then writes nodes and edges straight in
 * - edgeId(s,t) gives the same s -> t id that the real app uses alr
 */


/** 3 notes --> 3 inst --> 1 filter --> 1 output */
describe("compile", () => {
  it("compiles the mockup graph", () => {
    const doc = docOf(
      [
        notes("n1", "c4 e4 g4"), notes("n2", "c2 ~ c2 ~"), notes("n3", "x ~ x x"),
        inst("i1", "saw"), inst("i2", "square"), inst("i3", "tr909-bd"),
        filter("f1", "lpf", 800),
      ],
      [["n1", "i1"], ["n2", "i2"], ["n3", "i3"], ["i1", "f1"], ["i2", "f1"], ["i3", "f1"], ["f1", OUT]],
    );

    expect(compile(doc)).toEqual({
      code:
        'setcpm(120/4)\n' +
        'stack(note("c4 e4 g4").s("sawtooth"), note("c2 ~ c2 ~").s("square"), ' +
        's("bd").bank("RolandTR909").struct("x ~ x x")).lpf(800).lpq(0.7)',
      issues: [],
    });
  });

  // n2 is higher on screen (smaller y), so it plays first even though n1 was added first
  it("joins several Notes into one instrument with cat, top to bottom by y", () => {
    const doc = docOf(
      [notes("n1", "c4", 100), notes("n2", "e4", 50), inst("i1", "saw")],
      [["n1", "i1"], ["n2", "i1"], ["i1", OUT]],
    );
    expect(compile(doc).code).toBe(code('cat(note("e4"), note("c4")).s("sawtooth")'));
  });

  // percussion: the Notes are rhythms, so they go inside struct(...) as plain strings
  it("joins percussion rhythms with cat inside struct", () => {
    const doc = docOf(
      [notes("n1", "x ~", 0), notes("n2", "x x x x", 10), inst("i1", "tr909-hh")],
      [["n1", "i1"], ["n2", "i1"], ["i1", OUT]],
    );
    expect(compile(doc).code).toBe(code('s("hh").bank("RolandTR909").struct(cat("x ~", "x x x x"))'));
  });

  // n2 -> i2 never reaches the Output and f1 isn't connected at all
  it("leaves out nodes that don't reach the Output", () => {
    const doc = docOf(
      [notes("n1", "c4"), inst("i1", "saw"), notes("n2", "e4"), inst("i2", "square"), filter("f1", "room", 0.3)],
      [["n1", "i1"], ["i1", OUT], ["n2", "i2"]],
    );
    expect(compile(doc)).toEqual({ code: code('note("c4").s("sawtooth")'), issues: [] });
  });

  // a room with only the Output still has to be valid code
  it("compiles an empty doc to silence", () => {
    expect(compile(emptyDoc())).toEqual({ code: code("silence"), issues: [] });
  });

  it("uses the doc's bpm", () => {
    const doc = emptyDoc();
    doc.settings.bpm = 90;
    expect(compile(doc).code).toBe("setcpm(90/4)\nsilence");
  });

  // f1 feeds both f2 and the Output, so it's compiled once into v1 and used twice
  it("compiles a node feeding 2+ places once, as a variable", () => {
    const doc = docOf(
      [notes("n1", "c4"), inst("i1", "saw"), filter("f1", "lpf", 800), filter("f2", "room", 0.5)],
      [["n1", "i1"], ["i1", "f1"], ["f1", "f2"], ["f2", OUT], ["f1", OUT]],
    );
    expect(compile(doc).code).toBe(code(
      'const v1 = note("c4").s("sawtooth").lpf(800).lpq(0.7)',
      "stack(v1, v1.room(0.5))",
    ));
  });

  // a broken Notes node is skipped and reported; the rest of the song still plays
  it("skips bad notes and reports them", () => {
    const doc = docOf(
      [notes("n1", 'c4 "e4'), inst("i1", "saw"), notes("n2", "g4"), inst("i2", "square")],
      [["n1", "i1"], ["i1", OUT], ["n2", "i2"], ["i2", OUT]],
    );
    expect(compile(doc)).toEqual({
      code: code('note("g4").s("square")'),
      issues: [{ nodeId: "n1", message: expect.any(String) }],
    });
  });

  // i1 is muted, which leaves f1 with nothing to filter, so f1 is left out too
  it("leaves out muted instruments and filters with nothing left to play", () => {
    const doc = docOf(
      [notes("n1", "c4"), inst("i1", "saw", { muted: true }), filter("f1", "lpf", 800), notes("n2", "e4"), inst("i2", "square")],
      [["n1", "i1"], ["i1", "f1"], ["f1", OUT], ["n2", "i2"], ["i2", OUT]],
    );
    expect(compile(doc).code).toBe(code('note("e4").s("square")'));
  });

  // once anything is soloed, only soloed instruments play
  it("plays only soloed instruments when any are soloed", () => {
    const doc = docOf(
      [notes("n1", "c4"), inst("i1", "saw", { solo: true }), notes("n2", "e4"), inst("i2", "square")],
      [["n1", "i1"], ["i1", OUT], ["n2", "i2"], ["i2", OUT]],
    );
    expect(compile(doc).code).toBe(code('note("c4").s("sawtooth")'));
  });
});