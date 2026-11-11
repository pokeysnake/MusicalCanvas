"use client";
import { useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronUp, SlidersHorizontal, X } from "lucide-react";
import { FILTERS, type FilterKind } from "@/model/filters";
import type { FxEffect } from "@/model/types";
import { useUpdateNodeData } from "@/canvas/dispatch";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePortalRoot } from "@/ui/portalRoot";
import "./fx-rack.css";

/**
 * FX rack: several effects in ONE node instead of a chain of Filter nodes (compiled top row first, see compile.ts).
 * Each row: a bypass light, the effect name, a slider, its value, and remove (on hover).
 * "+ add effect" opens a themed dropdown; dropping an effect chip from the sidebar onto the rack also adds a row
 * (EditorApp onDrop). Collapsing folds it to one line of chips (LPF · GAIN · DLY · REV); that's UI state only.
 *
 * Every change sends ONE updateNodeData op with the whole new `effects` list. Sliders keep a local draft while
 * dragging and send the op on release, so a drag is one op, not hundreds (same idea as FilterNode's draft-on-blur).
 */

const SHORT: Record<FilterKind, string> = { lpf: "LPF", hpf: "HPF", bpf: "BPF", room: "REV", delay: "DLY", gain: "GAIN" };
const DEFAULT_Q = 0.7;

// Hz controls use a log scale so the slider isn't all bunched up at the low end
const STEPS = 1000;
function toSlider(kind: FilterKind, v: number): number {
    const f = FILTERS[kind];
    if (f.unit !== "Hz") return v;
    return (Math.log(v / f.min) / Math.log(f.max / f.min)) * STEPS;
}
function fromSlider(kind: FilterKind, s: number): number {
    const f = FILTERS[kind];
    if (f.unit !== "Hz") return s;
    return Math.round(f.min * Math.pow(f.max / f.min, s / STEPS));
}
function show(kind: FilterKind, v: number): string {
    if (FILTERS[kind].unit !== "Hz") return v.toFixed(2);
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;
}

/** a new row for `kind` with its default value (filters also get a default Q) */
export function newEffect(kind: FilterKind): FxEffect {
    const f = FILTERS[kind];
    return { id: crypto.randomUUID(), kind, value: f.def, on: true, ...(f.hasQ ? { q: DEFAULT_Q } : {}) };
}

export default function FxRackNode({ id, data }: NodeProps) {
    const effects = (data.effects ?? []) as FxEffect[];
    const update = useUpdateNodeData(id);
    const setEffects = (next: FxEffect[]) => update({ effects: next });
    const patchRow = (rowId: string, patch: Partial<FxEffect>) =>
        setEffects(effects.map((e) => (e.id === rowId ? { ...e, ...patch } : e)));

    const root = usePortalRoot();
    const [collapsed, setCollapsed] = useState(false); // UI only, never in the Doc

    // slider drafts: rowId -> value while dragging; committed on release
    const [drafts, setDrafts] = useState<Record<string, number>>({});
    const commit = (rowId: string) => {
        const v = drafts[rowId];
        if (v === undefined) return;
        setDrafts((d) => {
            const rest = { ...d };
            delete rest[rowId];
            return rest;
        });
        if (v !== effects.find((e) => e.id === rowId)?.value) patchRow(rowId, { value: v });
    };

    // highlight while an effect chip is dragged over the rack (counter, since dragenter/leave also fire on children)
    const depth = useRef(0);
    const [dropping, setDropping] = useState(false);

    return (
        <div className={"fx-rack" + (collapsed ? " is-collapsed" : "") + (dropping ? " is-dropping" : "")}
            onDragEnter={() => { depth.current++; setDropping(true); }}
            onDragLeave={() => { if (--depth.current <= 0) { depth.current = 0; setDropping(false); } }}
            onDrop={() => { depth.current = 0; setDropping(false); }}>
            <Handle type="target" position={Position.Left} />

            <div className="fx-rack__header">
                <div className="fx-rack__icon" aria-hidden="true"><SlidersHorizontal size={14} /></div>
                <div className="fx-rack__titles">
                    <span className="fx-rack__eyebrow">FX Rack</span>
                    <span className="fx-rack__title">{effects.length} effect{effects.length === 1 ? "" : "s"}</span>
                </div>
                <button type="button" className="fx-rack__fold nodrag" onClick={() => setCollapsed(!collapsed)}
                    aria-label={collapsed ? "Expand" : "Collapse"} title={collapsed ? "Expand" : "Collapse"}>
                    {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
            </div>

            {collapsed ? (
                <div className="fx-rack__chips">
                    {effects.length === 0 && <span className="fx-rack__empty">empty</span>}
                    {effects.map((e) => (
                        <span key={e.id} className={"fx-rack__chip" + (e.on ? "" : " is-off")}>{SHORT[e.kind] ?? e.kind}</span>
                    ))}
                </div>
            ) : (
                <>
                    {effects.length === 0 && (
                        <p className="fx-rack__empty">No effects yet: add one below, or drop an effect chip here.</p>
                    )}
                    <ul className="fx-rack__rows">
                        {effects.map((e) => {
                            const f = FILTERS[e.kind];
                            if (!f) return null; // unknown kind from a newer client: compile.ts reports it
                            const hz = f.unit === "Hz";
                            const value = drafts[e.id] ?? e.value;
                            return (
                                <li key={e.id} className={"fx-rack__row" + (e.on ? "" : " is-off")}>
                                    <button type="button" className="fx-rack__led nodrag" aria-pressed={e.on}
                                        aria-label={`${f.label} ${e.on ? "on" : "bypassed"}`}
                                        title={e.on ? "On (click to bypass)" : "Bypassed (click to turn on)"}
                                        onClick={() => patchRow(e.id, { on: !e.on })} />
                                    <span className="fx-rack__name">{f.label}</span>
                                    <input type="range" className="fx-rack__slider nodrag" aria-label={f.label}
                                        min={hz ? 0 : f.min} max={hz ? STEPS : f.max} step={hz ? 1 : f.step}
                                        value={toSlider(e.kind, value)}
                                        onChange={(ev) => {
                                            const v = fromSlider(e.kind, Number(ev.target.value));
                                            setDrafts((d) => ({ ...d, [e.id]: v }));
                                        }}
                                        onPointerUp={() => commit(e.id)} onKeyUp={() => commit(e.id)} onBlur={() => commit(e.id)} />
                                    <span className="fx-rack__value">{show(e.kind, value)}{hz && <small>Hz</small>}</span>
                                    <button type="button" className="fx-rack__remove nodrag" aria-label={`Remove ${f.label}`}
                                        onClick={() => setEffects(effects.filter((x) => x.id !== e.id))}>
                                        <X size={12} />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    {/* shadcn dropdown (Radix), themed by our tokens */}
                    <DropdownMenu>
                        <DropdownMenuTrigger className="fx-rack__add nodrag">+ add effect</DropdownMenuTrigger>
                        <DropdownMenuContent container={root} align="center" className="fx-menu">
                            <DropdownMenuLabel className="fx-menu__label">Add effect</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {(Object.keys(FILTERS) as FilterKind[]).map((k) => (
                                <DropdownMenuItem key={k} className="fx-menu__item"
                                    onSelect={() => setEffects([...effects, newEffect(k)])}>
                                    <span className="fx-menu__dot" aria-hidden="true" />
                                    <span className="fx-menu__name">{FILTERS[k].label}</span>
                                    <span className="fx-menu__short">{SHORT[k]}</span>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </>
            )}

            <div className="fx-rack__drop" aria-hidden="true">Drop to add to the rack</div>
            <Handle type="source" position={Position.Right} />
        </div>
    );
}
