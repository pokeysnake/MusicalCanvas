"use client";
import { useEffect, useState } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import "./filter-node.css";

/* ---------- Filter types (outside the component; the compiler will reuse this in Stage 4) ---------- */
export const FILTERS = {
  lpf:   { label: "Low-pass",  unit: "Hz", min: 20, max: 20000, step: 10,   def: 800,  hasQ: true },
  hpf:   { label: "High-pass", unit: "Hz", min: 20, max: 20000, step: 10,   def: 200,  hasQ: true },
  bpf:   { label: "Band-pass", unit: "Hz", min: 20, max: 20000, step: 10,   def: 1000, hasQ: true },
  room:  { label: "Reverb",    unit: "",   min: 0,  max: 1,     step: 0.05, def: 0.3,  hasQ: false },
  delay: { label: "Delay",     unit: "",   min: 0,  max: 1,     step: 0.05, def: 0.25, hasQ: false },
  gain:  { label: "Gain",      unit: "",   min: 0,  max: 2,     step: 0.05, def: 1,    hasQ: false },
} as const;

export type FilterKind = keyof typeof FILTERS;

const Q_MIN = 0.1;
const Q_MAX = 20;
const Q_DEFAULT = 0.7;

/* true when the typed text is a number inside [min, max] */
const inRange = (text: string, min: number, max: number) => {
  const n = Number(text);
  return text !== "" && !Number.isNaN(n) && n >= min && n <= max;
};

export default function FilterNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow();

  /* ---------- Current values from node data ---------- */
  const kind = (data.kind as FilterKind) ?? "lpf";
  const spec = FILTERS[kind];
  const value = Number(data.value ?? spec.def);
  const q = Number(data.q ?? Q_DEFAULT);

  /* ---------- Value field: typed text kept separate from the saved number ---------- */
  const [valueText, setValueText] = useState(String(value));
  useEffect(() => { setValueText(String(value)); }, [value]); // sync when value changes from outside

  const commitValue = (text: string) => {
    setValueText(text);
    if (inRange(text, spec.min, spec.max)) updateNodeData(id, { value: Number(text) });
  };

  /* ---------- Q field: same pattern (hooks always run, even when Q is hidden) ---------- */
  const [qText, setQText] = useState(String(q));
  useEffect(() => { setQText(String(q)); }, [q]);

  const commitQ = (text: string) => {
    setQText(text);
    if (inRange(text, Q_MIN, Q_MAX)) updateNodeData(id, { q: Number(text) });
  };

  /* ---------- Type change: reset value to the new type's default ---------- */
  const changeKind = (k: FilterKind) => {
    updateNodeData(id, { kind: k, value: FILTERS[k].def });
  };

  return (
    <div className="filter-node">
      <Handle type="target" position={Position.Left} />

      {/* Header */}
      <div className="filter-node__header">
        <div className="filter-node__icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round">
            <path d="M2 7h9c2 0 3 1 4 4s2 7 5 7" />
          </svg>
        </div>
        <div className="filter-node__titles">
          <span className="filter-node__eyebrow">Filter</span>
          <select
            className="filter-node__kind nodrag"
            aria-label="Filter type"
            value={kind}
            onChange={(e) => changeKind(e.target.value as FilterKind)}
          >
            {Object.entries(FILTERS).map(([key, f]) => (
              <option key={key} value={key}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Body */}
      <div className="filter-node__body">
        <label className="filter-node__field">
          <span className="filter-node__label">{spec.unit ? "Cutoff" : "Amount"}</span>
          <span className="filter-node__inputwrap">
            <input
              type="number"
              className="filter-node__input nodrag"
              min={spec.min} max={spec.max} step={spec.step}
              value={valueText}
              aria-invalid={!inRange(valueText, spec.min, spec.max)}
              onChange={(e) => commitValue(e.target.value)}
              onBlur={() => setValueText(String(value))}
            />
            {spec.unit && <span className="filter-node__unit">{spec.unit}</span>}
          </span>
        </label>

        {spec.hasQ && (
          <label className="filter-node__field filter-node__field--small">
            <span className="filter-node__label">Q</span>
            <input
              type="number"
              className="filter-node__input nodrag"
              min={Q_MIN} max={Q_MAX} step={0.1}
              value={qText}
              aria-invalid={!inRange(qText, Q_MIN, Q_MAX)}
              onChange={(e) => commitQ(e.target.value)}
              onBlur={() => setQText(String(q))}
            />
          </label>
        )}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}