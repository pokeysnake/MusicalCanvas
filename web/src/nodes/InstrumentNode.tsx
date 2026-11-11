"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useUpdateNodeData } from "@/canvas/dispatch";
import { DEFAULT_SOUND, SOUNDS } from "@/model/sounds";
import NodeSelect, { type SelectOption } from "@/ui/NodeSelect";
import "./instrument-node.css";

const CATEGORY_LABEL: Record<(typeof SOUNDS)[number]["category"], string> = {
  "synths": "Synths", "samples": "Samples", "drum-machines": "Drum machines", "wavetables": "Wavetables",
};
// built once from the SOUNDS table, so a new sound shows up in the menu automatically
const SOUND_OPTIONS: SelectOption[] = SOUNDS.map((s) => ({ value: s.id, label: s.label, group: CATEGORY_LABEL[s.category] }));

export default function InstrumentNode({ id, data }: NodeProps) {
  // select + toggle buttons are single discrete actions, so they dispatch right away
  const update = useUpdateNodeData(id);
  const sound = String(data.sound ?? DEFAULT_SOUND);
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
        {/* themed dropdown (the native select's menu is always white), sounds grouped like strudel.cc's tabs */}
        <NodeSelect className="instrument-node__sound" label="Sound" color="var(--instrument)"
          value={sound} options={SOUND_OPTIONS} onChange={(v) => update({ sound: v })} />
      </div>

      <div className="instrument-node__actions">
        <button type="button" className="instrument-node__btn nodrag" aria-label="Mute"
                aria-pressed={muted} onClick={() => update({ muted: !muted })}>M</button>
        <button type="button" className="instrument-node__btn nodrag" aria-label="Solo"
                aria-pressed={solo} onClick={() => update({ solo: !solo })}>S</button>
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}