"use client";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import "./instrument-node.css";

const SOUNDS = [
  { value: "triangle", label: "Triangle" },
  { value: "sawtooth", label: "Sawtooth" },
  { value: "square", label: "Square" },
  { value: "sine", label: "Sine" },
];

export default function InstrumentNode({ id, data }: NodeProps) {
  // Stage 0-2 shortcut: edits go straight into React Flow state.
  // In Stage 3 replace updateNodeData with an `updateNodeData` op on your doc model.
  const { updateNodeData } = useReactFlow();
  const sound = String(data.sound ?? "triangle");
  const muted = Boolean(data.muted);
  const solo = Boolean(data.solo);

  return (
    <div className={"instrument-node" + (muted ? " instrument-node--muted" : "")}>
      <Handle type="target" position={Position.Left} />

      <div className="instrument-node__icon" aria-hidden="true">
        <svg width="17" height="17" viewBox="0 0 20 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round">
          <path d="M1 12c2.2-6 4.3-6 6.3 0s4.2 6 6.3 0 4.2-6 5.4-3" />
        </svg>
      </div>

      <div className="instrument-node__titles">
        <span className="instrument-node__eyebrow">Instrument</span>
        <select
          className="instrument-node__sound nodrag"
          aria-label="Sound"
          value={sound}
          onChange={(e) => updateNodeData(id, { sound: e.target.value })}
        >
          {SOUNDS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="instrument-node__actions">
        <button type="button" className="instrument-node__btn nodrag" aria-label="Mute"
                aria-pressed={muted} onClick={() => updateNodeData(id, { muted: !muted })}>M</button>
        <button type="button" className="instrument-node__btn nodrag" aria-label="Solo"
                aria-pressed={solo} onClick={() => updateNodeData(id, { solo: !solo })}>S</button>
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}