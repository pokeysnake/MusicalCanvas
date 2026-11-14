/* ---------- Notes node layout: bars -> rows of cells ---------- */
// Each bar gets its own row. A bar too crowded for one row wraps onto 2 rows (beats 1-2, 3-4) or 4 rows
// (one beat each). Widths stay proportional to how long things play, so a step that crosses a row break
// is cut into two pieces.
import type { BarStep } from "@/model/notes";

export type Piece = {
    step: BarStep;
    len: number; // share of the row, in the bar's weight units
    cutStart: boolean; // continues from the row above
    cutEnd: boolean; // continues on the row below
};

export type Line = {
    bar: number | null; // 1-based bar number on a bar's first row, null on its wrapped rows
    beats: number[]; // beat numbers under this row, e.g. [3, 4]
    pieces: Piece[];
};

export type Layout = { rowWidth: number; lines: Line[]; numbered: boolean };

export type LayoutOptions = { beatsPerBar: number; minRow: number; maxRow: number; shortestStep: number };

const EPS = 1e-9;

export function layoutBars(bars: BarStep[][], o: LayoutOptions): Layout {
    // how many rows each bar needs, and how wide a row wants to be
    const plans = bars.map((bar) => {
        const total = bar.reduce((sum, s) => sum + s.weight, 0);
        const shortest = Math.min(...bar.map((s) => s.weight));
        const needed = (total / shortest) * o.shortestStep;
        // split only at whole beats: 1, 2, 4 ... rows (whichever fits first; the last one if none fit)
        const splits = [1, 2, 4].filter((n) => o.beatsPerBar % n === 0);
        const rows = splits.find((n) => needed / n <= o.maxRow) ?? splits[splits.length - 1];
        return { bar, total, rows, rowNeeds: needed / rows };
    });

    const widest = Math.max(0, ...plans.map((p) => p.rowNeeds));
    const rowWidth = Math.ceil(Math.min(o.maxRow, Math.max(o.minRow, widest)));

    const lines: Line[] = [];
    plans.forEach(({ bar, total, rows }, b) => {
        const beatsPerRow = o.beatsPerBar / rows;
        for (let r = 0; r < rows; r++) {
            const lo = (r * total) / rows;
            const hi = ((r + 1) * total) / rows;
            const pieces: Piece[] = [];
            let pos = 0;
            for (const step of bar) {
                const start = pos;
                const end = (pos += step.weight);
                const len = Math.min(end, hi) - Math.max(start, lo);
                if (len > EPS) pieces.push({ step, len, cutStart: start < lo - EPS, cutEnd: end > hi + EPS });
            }
            lines.push({
                bar: r === 0 ? b + 1 : null,
                beats: Array.from({ length: beatsPerRow }, (_, i) => r * beatsPerRow + i + 1),
                pieces,
            });
        }
    });

    // number the rows only when there's more than one
    return { rowWidth, lines, numbered: lines.length > 1 };
}
