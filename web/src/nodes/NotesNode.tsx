import { Handle, Position, type NodeProps } from "@xyflow/react";
import { parseNotes } from "@/model/notes";
import "./notes-node.css";

export default function NotesNode({ data }: NodeProps) {
    const parsed = parseNotes(String(data.text ?? ""));
    const steps = parsed.ok ? parsed.steps.map((s) => s.text) : [];

    return (
        <div className="notes-node">
            <div className="notes-node__header">
                <div className="notes-node__titles">
                    <span className="notes-node__eyebrow">Notes</span>
                    <span className="notes-node__title">{String(data.name ?? "Untitled")}</span>
                </div>
                <span className="notes-node__meta">{parsed.ok ? `${steps.length} steps` : "invalid"}</span>
            </div>
            <div className="notes-node__body">
                <div className="notes-node__steps">
                    {steps.map((s, i) => {
                        const isRest = s === "~";
                        const isChord = s.startsWith("[") && s.endsWith("]") && s.includes(",");
                        return (
                            <div
                                key={i}
                                className={
                                    "notes-node__step" +
                                    (isRest ? " notes-node__step--rest" : "") +
                                    (isChord ? " notes-node__step--chord" : "")
                                }
                            >
                                {isChord
                                    ? s.slice(1, -1).split(",").reverse().map((n) => <span key={n}>{n}</span>)
                                    : s}
                            </div>
                        );
                    })}
                </div>
            </div>
            <Handle type="source" position={Position.Right} />
        </div>
    );
}
