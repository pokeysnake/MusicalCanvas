"use client";
import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { KeyboardEvent } from "react";
import "./filter-node.css";

import { FILTERS, type FilterKind } from "@/model/filters";
import { useUpdateNodeData } from "@/canvas/dispatch";

const Q_MIN = 0.1;
const Q_MAX = 20;
const Q_DEFAULT = 0.7;

/* true when the typed text is a number inside [min, max] */
const inRange = (text: string, min: number, max: number) => {
  const n = Number(text);
  return text !== "" && !Number.isNaN(n) && n >= min && n <= max;
};

/* Enter commits by blurring, so blur is the one place that dispatches */
const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") e.currentTarget.blur();
};

export default function FilterNode({ id, data }: NodeProps) {
  const update = useUpdateNodeData(id);

  /* ---------- Current values from node data ---------- */
  const kind = (data.kind as FilterKind) ?? "lpf";
  const spec = FILTERS[kind];
  const value = Number(data.value ?? spec.def);
  const q = Number(data.q ?? Q_DEFAULT);

  /* ---------- Value field: a local draft only while editing ----------
     typing only changes the draft; one op is sent on blur/Enter (not one per keystroke).
     When not editing (draft = null) the field shows the Doc value, so outside changes need no syncing. */
  const [valueDraft, setValueDraft] = useState<string | null>(null);
  const valueText = valueDraft ?? String(value);

  const commitValue = () => {
    const n = Number(valueText);
    if (inRange(valueText, spec.min, spec.max) && n !== value) update({ value: n });
    setValueDraft(null); // invalid or unchanged: falls back to the saved value
  };

  /* ---------- Q field: same pattern (hooks always run, even when Q is hidden) ---------- */
  const [qDraft, setQDraft] = useState<string | null>(null);
  const qText = qDraft ?? String(q);

  const commitQ = () => {
    const n = Number(qText);
    if (inRange(qText, Q_MIN, Q_MAX) && n !== q) update({ q: n });
    setQDraft(null);
  };

  /* ---------- Type change: one action, so kind + reset value go in ONE op ---------- */
  const changeKind = (k: FilterKind) => {
    update({ kind: k, value: FILTERS[k].def });
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
              onChange={(e) => setValueDraft(e.target.value)}
              onBlur={commitValue}
              onKeyDown={blurOnEnter}
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
              onChange={(e) => setQDraft(e.target.value)}
              onBlur={commitQ}
              onKeyDown={blurOnEnter}
            />
          </label>
        )}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}