import { describe, it, expect } from "vitest";
import { parseNotes } from "./notes";

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

/* ---------- valid text ---------- */
describe("parseNotes: valid", () => {
  it("splits a plain sequence into steps with offsets into the text", () => {
    expect(parseNotes("c4 e4 g4")).toEqual({
      ok: true,
      steps: [
        { text: "c4", from: 0, to: 2 },
        { text: "e4", from: 3, to: 5 },
        { text: "g4", from: 6, to: 8 },
      ],
    });
  });

  it("keeps a sub-group as one step", () => {
    expect(parseNotes("c4 [e4 g4] ~")).toEqual({
      ok: true,
      steps: [
        { text: "c4", from: 0, to: 2 },
        { text: "[e4 g4]", from: 3, to: 10 },
        { text: "~", from: 11, to: 12 },
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
        { text: "c4", from: 2, to: 4 },
        { text: "e4", from: 7, to: 9 },
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
