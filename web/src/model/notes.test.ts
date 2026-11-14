import { describe, it, expect } from "vitest";
import { barsOf, parseNotes } from "./notes";

/* ---------- helpers ---------- */
// step texts only, for tests that don't care about offsets
function stepTexts(text: string): string[] {
  const r = parseNotes(text);
  if (!r.ok) throw new Error(`expected ok, got error: ${r.message}`);
  return r.steps.map((s) => s.text);
}

function mustFail(text: string) {
  const r = parseNotes(text);
  if (r.ok) throw new Error(`expected an error for ${JSON.stringify(text)}`);
  return r;
}

const note = (text: string) => ({ kind: "note", text }) as const;
const part = <V,>(view: V, weight = 1) => ({ weight, view });

// step views only
function views(text: string) {
  const r = parseNotes(text);
  if (!r.ok) throw new Error(`expected ok, got error: ${r.message}`);
  return r.steps.map((s) => s.view);
}

/* ---------- valid text ---------- */
describe("parseNotes: valid", () => {
  it("splits a plain sequence into steps with offsets into the text", () => {
    expect(parseNotes("c4 e4 g4")).toEqual({
      ok: true,
      steps: [
        { text: "c4", from: 0, to: 2, weight: 1, view: note("c4") },
        { text: "e4", from: 3, to: 5, weight: 1, view: note("e4") },
        { text: "g4", from: 6, to: 8, weight: 1, view: note("g4") },
      ],
    });
  });

  it("keeps a sub-group as one step", () => {
    expect(parseNotes("c4 [e4 g4] ~")).toEqual({
      ok: true,
      steps: [
        { text: "c4", from: 0, to: 2, weight: 1, view: note("c4") },
        { text: "[e4 g4]", from: 3, to: 10, weight: 1, view: { kind: "group", parts: [part(note("e4")), part(note("g4"))] } },
        { text: "~", from: 11, to: 12, weight: 1, view: { kind: "rest" } },
      ],
    });
  });

  it("treats rests as steps", () => {
    expect(stepTexts("~ c4 ~ ~")).toEqual(["~", "c4", "~", "~"]);
  });

  it("keeps a chord as one step", () => {
    expect(stepTexts("[c4,e4,g4] a3")).toEqual(["[c4,e4,g4]", "a3"]);
  });

  it("keeps alternation and modifiers inside their step", () => {
    expect(stepTexts("<c4 e4> g4*2 a4@3")).toEqual(["<c4 e4>", "g4*2", "a4@3"]);
  });

  it("ignores extra whitespace", () => {
    expect(parseNotes("  c4   e4 ")).toEqual({
      ok: true,
      steps: [
        { text: "c4", from: 2, to: 4, weight: 1, view: note("c4") },
        { text: "e4", from: 7, to: 9, weight: 1, view: note("e4") },
      ],
    });
  });

  it("treats a top-level stack as a single step", () => {
    expect(stepTexts("c4 e4, g4")).toEqual(["c4 e4, g4"]);
  });

  it("treats empty or blank text as valid silence", () => {
    expect(parseNotes("")).toEqual({ ok: true, steps: [] });
    expect(parseNotes("   ")).toEqual({ ok: true, steps: [] });
  });
});

/* ---------- step views (what the node draws) ---------- */
describe("parseNotes: step views", () => {
  it("reads chords of any size, keeping the written order", () => {
    expect(views("[c5,g5,e4,c4]")).toEqual([{ kind: "chord", notes: ["c5", "g5", "e4", "c4"] }]);
  });

  it("reads a group, including a rest inside it", () => {
    expect(views("[~ c4]")).toEqual([{ kind: "group", parts: [part({ kind: "rest" }), part(note("c4"))] }]);
  });

  it("reads nested groups and chords inside groups", () => {
    expect(views("[a4 [b4 c5]] [[c4,e4] g4]")).toEqual([
      { kind: "group", parts: [part(note("a4")), part({ kind: "group", parts: [part(note("b4")), part(note("c5"))] })] },
      { kind: "group", parts: [part({ kind: "chord", notes: ["c4", "e4"] }), part(note("g4"))] },
    ]);
  });

  it("reads alternation", () => {
    expect(views("<c4 [e4,g4]>")).toEqual([{ kind: "alt", options: [note("c4"), { kind: "chord", notes: ["e4", "g4"] }] }]);
  });

  it("shows speed modifiers as written", () => {
    expect(views("g4*2 a4/2")).toEqual([
      { kind: "other", text: "g4*2" },
      { kind: "other", text: "a4/2" },
    ]);
  });

  it("gives @ and _ steps a longer weight, not a different look", () => {
    const r = parseNotes("c4@2 e4 _ _ g4");
    if (!r.ok) throw new Error(r.message);
    expect(r.steps.map((s) => [s.weight, s.view])).toEqual([
      [2, note("c4")],
      [3, note("e4")],
      [1, note("g4")],
    ]);
  });

  it("splits a repeated step into equal copies", () => {
    const r = parseNotes("c4!2 e4");
    if (!r.ok) throw new Error(r.message);
    expect(r.steps.map((s) => [s.weight, s.view])).toEqual([
      [2, { kind: "group", parts: [part(note("c4")), part(note("c4"))] }],
      [1, note("e4")],
    ]);
  });

  it("keeps weights inside groups", () => {
    expect(views("[c4@3 e4]")).toEqual([{ kind: "group", parts: [part(note("c4"), 3), part(note("e4"))] }]);
  });

  it("shows a chord that isn't plain notes as written", () => {
    expect(views("[c4 e4, g4]")).toEqual([{ kind: "other", text: "[c4 e4, g4]" }]);
  });

  it("treats - as a rest too", () => {
    expect(views("c4 -")).toEqual([note("c4"), { kind: "rest" }]);
  });
});

/* ---------- bars ---------- */
describe("barsOf", () => {
  function bars(text: string) {
    const r = parseNotes(text);
    if (!r.ok) throw new Error(r.message);
    return barsOf(r.steps).map((bar) => bar.map((s) => [s.weight, s.view]));
  }

  it("puts a normal text in one bar, however many steps", () => {
    expect(bars("c4@2 e4 g4")).toEqual([[[2, note("c4")], [1, note("e4")], [1, note("g4")]]]);
  });

  it("gives each option of a whole-text <...> its own bar", () => {
    expect(bars("<[c4 e4] [g4@2 a4 b4]>")).toEqual([
      [[1, note("c4")], [1, note("e4")]],
      [[2, note("g4")], [1, note("a4")], [1, note("b4")]],
    ]);
  });

  it("lets a single note fill its bar", () => {
    expect(bars("<c4 [e4 g4]>")).toEqual([[[1, note("c4")]], [[1, note("e4")], [1, note("g4")]]]);
  });

  it("keeps a <...> that is only part of the text as one step", () => {
    expect(bars("c4 <e4 g4>")).toEqual([[[1, note("c4")], [1, { kind: "alt", options: [note("e4"), note("g4")] }]]]);
  });

  it("has no bars for blank text", () => {
    expect(bars("")).toEqual([]);
  });
});

/* ---------- invalid text ---------- */
describe("parseNotes: errors", () => {
  it("points an unclosed bracket at the end of the text", () => {
    expect(mustFail("c4 [e4").offset).toBe(6);
  });

  it("points a stray closing bracket at the bracket", () => {
    expect(mustFail("c4 ]").offset).toBe(3);
  });

  it("points a stray quote at the quote", () => {
    expect(mustFail('c4 "e4').offset).toBe(3);
  });

  it("returns a readable message", () => {
    expect(mustFail("c4 ]").message).toBe('Unexpected "]"');
  });
});
