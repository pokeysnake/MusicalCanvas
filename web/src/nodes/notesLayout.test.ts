import { describe, it, expect } from "vitest";
import { barsOf, parseNotes } from "@/model/notes";
import { layoutBars } from "./notesLayout";

const OPTS = { beatsPerBar: 4, minRow: 292, maxRow: 452, shortestStep: 44 };

function layout(text: string) {
    const r = parseNotes(text);
    if (!r.ok) throw new Error(r.message);
    return layoutBars(barsOf(r.steps), OPTS);
}

// each row as "bar|beats|piece piece ..." where a piece is its text, its length, and > / < for cuts
function rows(text: string) {
    return layout(text).lines.map(
        (l) =>
            `${l.bar ?? "-"}|${l.beats.join("")}|` +
            l.pieces
                .map((p) => `${p.cutStart ? "<" : ""}${p.step.view.kind === "note" ? p.step.view.text : p.step.view.kind}:${+p.len.toFixed(2)}${p.cutEnd ? ">" : ""}`)
                .join(" "),
    );
}

describe("layoutBars", () => {
    it("keeps a short bar on one row, unnumbered, at the default width", () => {
        expect(rows("c4 e4 g4 b4")).toEqual(["1|1234|c4:1 e4:1 g4:1 b4:1"]);
        expect(layout("c4 e4 g4 b4")).toMatchObject({ rowWidth: 292, numbered: false });
    });

    it("grows the row for a busier bar, up to the cap", () => {
        expect(layout("c4 d4 e4 f4 g4 a4 b4 c5").rowWidth).toBe(352); // 8 x 44
        expect(layout("c4 d4 e4 f4 g4 a4 b4 c5 d5 e5").rowWidth).toBe(440);
    });

    it("wraps a crowded bar onto two half-bar rows", () => {
        expect(rows("c4 d4 e4 f4 g4 a4 b4 c5 d5 e5 f5 g5")).toEqual([
            "1|12|c4:1 d4:1 e4:1 f4:1 g4:1 a4:1",
            "-|34|b4:1 c5:1 d5:1 e5:1 f5:1 g5:1",
        ]);
    });

    it("cuts a step that crosses the row break", () => {
        // 11 steps don't split evenly: f4's middle sits on the break
        expect(rows("a4 b4 c4 d4 e4 f4 g4 a5 b5 c5 d5")[0]).toMatch(/<?.*f4:0.5>$/);
        expect(rows("a4 b4 c4 d4 e4 f4 g4 a5 b5 c5 d5")[1]).toMatch(/^-\|34\|<f4:0.5 /);
    });

    it("wraps to one beat per row when even halves are too crowded", () => {
        const text = Array.from({ length: 24 }, () => "c4").join(" ");
        expect(layout(text).lines.map((l) => l.beats)).toEqual([[1], [2], [3], [4]]);
    });

    it("gives each bar of a <...> its own numbered row", () => {
        expect(rows("<[c4 e4 g4 b4] [a3 c4 e4]>")).toEqual([
            "1|1234|c4:1 e4:1 g4:1 b4:1",
            "2|1234|a3:1 c4:1 e4:1",
        ]);
        expect(layout("<[c4 e4] [g4 a4]>").numbered).toBe(true);
    });

    it("uses lengths, not step counts, to decide on wrapping", () => {
        // c4@8 + 4 short steps: 12 units, shortest 1 -> 528px wanted -> two rows; c4 is cut in the middle
        expect(rows("c4@8 e4 f4 g4 a4")).toEqual(["1|12|c4:6>", "-|34|<c4:2 e4:1 f4:1 g4:1 a4:1"]);
    });

    it("lays out nothing for blank text", () => {
        expect(layout("")).toEqual({ rowWidth: 292, lines: [], numbered: false });
    });
});
