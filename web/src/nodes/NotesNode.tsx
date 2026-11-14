import { Handle, Position, type NodeProps } from "@xyflow/react";
import { barsOf, parseNotes, type StepView } from "@/model/notes";
import { BEATS_PER_BAR } from "@/model/compile";
import { layoutBars, type Piece } from "./notesLayout";
import { usePartRef } from "@/canvas/partRefs";
import "./notes-node.css";

// a chord taller than this shows its first notes and "+N"
const CHORD_MAX_LINES = 3;

/* ---------- bar layout (see notesLayout.ts) ---------- */
// one row per bar, widths = how long things play; crowded bars wrap onto more rows instead of scrolling
const LAYOUT = {
    beatsPerBar: BEATS_PER_BAR,
    minRow: 292, // the row width of a default 320px card (minus 14px padding each side)
    maxRow: 452, // the card stops growing at 480px; past that a bar wraps
    shortestStep: 44, // a row is as wide as it needs for its shortest step to be this wide
};
const CARD_PADDING_PX = 28;
const BAR_NUMBER_PX = 18; // the 1, 2, 3 column, only there when there's more than one row

export default function NotesNode({ id, data }: NodeProps) {
    const ref = usePartRef(id);
    const parsed = parseNotes(String(data.text ?? ""));
    const steps = parsed.ok ? parsed.steps : [];
    const bars = barsOf(steps);
    const { rowWidth, lines, numbered } = layoutBars(bars, LAYOUT);
    // how many bars it spans and how many steps (cells) share them; the title explains the difference
    const cells = bars.reduce((n, bar) => n + bar.length, 0);
    const meta = !parsed.ok ? "invalid" : `${bars.length} ${bars.length === 1 ? "bar" : "bars"} · ${cells} ${cells === 1 ? "step" : "steps"}`;
    const metaTitle = `Steps are the notes you wrote; they're squeezed into each bar of ${BEATS_PER_BAR} beats (the 1-${BEATS_PER_BAR} marks underneath), so they don't have to line up with the beats.`;

    return (
        <div className="notes-node" style={{ width: rowWidth + CARD_PADDING_PX + (numbered ? BAR_NUMBER_PX : 0) }}>
            {/* in a cat sequence: which one plays when (set by toFlowNodes from catGroups) */}
            {typeof data.seq === "number" && (
                <span className="notes-node__seq" title={`Plays ${data.seq === 1 ? "first" : `#${data.seq}`} in its sequence`}>
                    {data.seq}
                </span>
            )}
            <div className="notes-node__header">
                <div className="notes-node__titles">
                    <span className="notes-node__eyebrow">Notes<span className="node-ref">{ref}</span></span>
                    <span className="notes-node__title">{String(data.name ?? "Untitled")}</span>
                </div>
                <span className="notes-node__meta" title={parsed.ok ? metaTitle : undefined}>{meta}</span>
            </div>
            {lines.length > 0 && (
                <div className="notes-node__body">
                    {lines.map((line, i) => (
                        <div key={i} className={"notes-node__line" + (line.bar && i > 0 ? " notes-node__line--new-bar" : "")}>
                            {numbered && <span className="notes-node__bar-no">{line.bar ?? ""}</span>}
                            <div className="notes-node__bar">
                                {/* minmax(0, Nfr) keeps the columns exactly proportional even when text is wider */}
                                <div className="notes-node__steps" style={{ gridTemplateColumns: line.pieces.map((p) => `minmax(0, ${p.len}fr)`).join(" ") }}>
                                    {line.pieces.map((p, j) => <PieceCell key={j} piece={p} />)}
                                </div>
                                {/* beat marks under the row, so you can see which steps land on a beat */}
                                <div className="notes-node__ruler" aria-hidden>
                                    {line.beats.map((b) => <span key={b} className="notes-node__beat">{b}</span>)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <Handle type="source" position={Position.Right} />
        </div>
    );
}

/* ---------- one cell (or the part of a step that falls on this row) ---------- */
function PieceCell({ piece }: { piece: Piece }) {
    const { step, cutStart, cutEnd } = piece;
    const cls =
        `notes-node__step notes-node__step--${step.view.kind}` +
        (cutStart ? " notes-node__step--cut-start" : "") +
        (cutEnd ? " notes-node__step--cut-end" : "");
    // a step cut across rows shows its content once, on the first row
    return (
        <div className={cls} title={step.text}>
            {!cutStart && <StepContent view={step.view} />}
        </div>
    );
}

/* ---------- what goes inside one step cell ---------- */
function StepContent({ view }: { view: StepView }) {
    switch (view.kind) {
        case "note":
            return <span className="notes-node__text">{view.text}</span>;
        case "rest":
            return <span className="notes-node__text">~</span>;
        case "other":
            return <span className="notes-node__text notes-node__text--raw">{view.text}</span>;

        // stacked, lowest-written note at the bottom; big chords show the first few and "+N"
        case "chord": {
            const shown = view.notes.length > CHORD_MAX_LINES ? view.notes.slice(0, CHORD_MAX_LINES - 1) : view.notes;
            const hidden = view.notes.length - shown.length;
            return (
                <span className="notes-node__chord">
                    {hidden > 0 && <span className="notes-node__more">+{hidden}</span>}
                    {[...shown].reverse().map((n, i) => <span key={i}>{n}</span>)}
                </span>
            );
        }

        // the step split into slots side by side, each as wide as it plays
        case "group":
            return (
                <span className="notes-node__group">
                    {view.parts.map((p, i) => (
                        <span key={i} className={`notes-node__part notes-node__part--${p.view.kind}`} style={{ flexGrow: p.weight }}>
                            <StepContent view={p.view} />
                        </span>
                    ))}
                </span>
            );

        // a different option each bar: "c4 / e4" with a loop mark
        case "alt":
            return (
                <span className="notes-node__alt">
                    <span className="notes-node__alt-mark" aria-label="changes each bar">↻</span>
                    {view.options.map((o, i) => (
                        <span key={i} className="notes-node__alt-option">
                            <StepContent view={o} />
                        </span>
                    ))}
                </span>
            );
    }
}
