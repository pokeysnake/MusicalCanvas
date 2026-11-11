"use client";
import { Fragment, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronUp, SlidersHorizontal, X } from "lucide-react";
import { FILTERS, Q, type FilterKind } from "@/model/filters";
import type { FxEffect } from "@/model/types";
import { useUpdateNodeData } from "@/canvas/dispatch";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePortalRoot } from "@/ui/portalRoot";
import "./fx-rack.css";

/**
 * FX rack: several effects in ONE node instead of a chain of Filter nodes (compiled top row first, see compile.ts).
 * Each row: a bypass light, the effect name, a slider, its value, and remove (on hover). Filters (hasQ) get a
 * second, slimmer row underneath for Q (resonance).
 * "+ add effect" opens a themed dropdown; dropping an effect chip from the sidebar onto the rack also adds a row
 * (EditorApp onDrop). Collapsing folds it to one line of chips (LPF · GAIN · DLY · REV); that's UI state only.
 *
 * Every change sends ONE updateNodeData op with the whole new `effects` list. Sliders keep a local draft while
 * dragging and send the op on release, so a drag is one op, not hundreds (same idea as FilterNode's draft-on-blur).
 */

const SHORT: Record<FilterKind, string> = { lpf: "LPF", hpf: "HPF", bpf: "BPF", room: "REV", delay: "DLY", gain: "GAIN" };
// Hz and Q use a log scale (slider 0..STEPS) so the slider isn't all bunched up at the low end
const STEPS = 1000;
const toLog = (min: number, max: number, v: number) => (Math.log(v / min) / Math.log(max / min)) * STEPS;
const fromLog = (min: number, max: number, s: number) => min * Math.pow(max / min, s / STEPS);

function toSlider(kind: FilterKind, v: number): number {
    const f = FILTERS[kind];
    return f.unit === "Hz" ? toLog(f.min, f.max, v) : v;
}
function fromSlider(kind: FilterKind, s: number): number {
    const f = FILTERS[kind];
    return f.unit === "Hz" ? Math.round(fromLog(f.min, f.max, s)) : s;
}
function show(kind: FilterKind, v: number): string {
    if (FILTERS[kind].unit !== "Hz") return v.toFixed(2);
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;
}
const qFromSlider = (s: number) => Math.round(fromLog(Q.min, Q.max, s) * 10) / 10; // one decimal, like FilterNode

/** a new row for `kind` with its default value (filters also get a default Q) */
export function newEffect(kind: FilterKind): FxEffect {
    const f = FILTERS[kind];
    return { id: crypto.randomUUID(), kind, value: f.def, on: true, ...(f.hasQ ? { q: Q.def } : {}) };
}

// the add menu, grouped like the Filter node's dropdown
const KINDS = Object.keys(FILTERS) as FilterKind[];
const MENU_GROUPS = [
    { label: "Filters", kinds: KINDS.filter((k) => FILTERS[k].unit === "Hz") },
    { label: "Effects", kinds: KINDS.filter((k) => FILTERS[k].unit !== "Hz") },
];

export default function FxRackNode({ id, data }: NodeProps) {
    const effects = (data.effects ?? []) as FxEffect[];
    const update = useUpdateNodeData(id);
    const setEffects = (next: FxEffect[]) => update({ effects: next });
    const patchRow = (rowId: string, patch: Partial<FxEffect>) =>
        setEffects(effects.map((e) => (e.id === rowId ? { ...e, ...patch } : e)));

    const root = usePortalRoot();
    const [collapsed, setCollapsed] = useState(false); // UI only, never in the Doc

    // slider drafts while dragging, committed on release. Keyed "rowId:value" or "rowId:q"
    type Field = "value" | "q";
    const [drafts, setDrafts] = useState<Record<string, number>>({});
    const draftKey = (rowId: string, field: Field) => `${rowId}:${field}`;
    const setDraft = (rowId: string, field: Field, v: number) =>
        setDrafts((d) => ({ ...d, [draftKey(rowId, field)]: v }));
    const commit = (rowId: string, field: Field) => {
        const key = draftKey(rowId, field);
        const v = drafts[key];
        if (v === undefined) return;
        setDrafts((d) => {
            const rest = { ...d };
            delete rest[key];
            return rest;
        });
        const row = effects.find((e) => e.id === rowId);
        const current = field === "q" ? (row?.q ?? Q.def) : row?.value;
        if (row && v !== current) patchRow(rowId, { [field]: v });
    };
    // pointer up / key up / blur all mean "done dragging"
    const commitOn = (rowId: string, field: Field) => ({
        onPointerUp: () => commit(rowId, field),
        onKeyUp: () => commit(rowId, field),
        onBlur: () => commit(rowId, field),
    });

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
                            const value = drafts[draftKey(e.id, "value")] ?? e.value;
                            const q = drafts[draftKey(e.id, "q")] ?? e.q ?? Q.def;
                            return (
                                <Fragment key={e.id}>
                                <li className={"fx-rack__row" + (e.on ? "" : " is-off")}>
                                    <button type="button" className="fx-rack__led nodrag" aria-pressed={e.on}
                                        aria-label={`${f.label} ${e.on ? "on" : "bypassed"}`}
                                        title={e.on ? "On (click to bypass)" : "Bypassed (click to turn on)"}
                                        onClick={() => patchRow(e.id, { on: !e.on })} />
                                    <span className="fx-rack__name">{f.label}</span>
                                    <input type="range" className="fx-rack__slider nodrag" aria-label={f.label}
                                        min={hz ? 0 : f.min} max={hz ? STEPS : f.max} step={hz ? 1 : f.step}
                                        value={toSlider(e.kind, value)}
                                        onChange={(ev) => setDraft(e.id, "value", fromSlider(e.kind, Number(ev.target.value)))}
                                        {...commitOn(e.id, "value")} />
                                    <span className="fx-rack__value">{show(e.kind, value)}{hz && <small>Hz</small>}</span>
                                    <button type="button" className="fx-rack__remove nodrag" aria-label={`Remove ${f.label}`}
                                        onClick={() => setEffects(effects.filter((x) => x.id !== e.id))}>
                                        <X size={12} />
                                    </button>
                                </li>
                                {/* filters: resonance on its own slim row, lined up under the main slider */}
                                {f.hasQ && (
                                    <li className={"fx-rack__row fx-rack__row--q" + (e.on ? "" : " is-off")}>
                                        <span />
                                        <span className="fx-rack__name">Q</span>
                                        <input type="range" className="fx-rack__slider nodrag" aria-label={`${f.label} Q`}
                                            min={0} max={STEPS} step={1} value={toLog(Q.min, Q.max, q)}
                                            onChange={(ev) => setDraft(e.id, "q", qFromSlider(Number(ev.target.value)))}
                                            {...commitOn(e.id, "q")} />
                                        <span className="fx-rack__value">{q.toFixed(1)}</span>
                                        <span />
                                    </li>
                                )}
                                </Fragment>
                            );
                        })}
                    </ul>
                    {/* shadcn dropdown (Radix), themed by our tokens */}
                    <DropdownMenu>
                        <DropdownMenuTrigger className="fx-rack__add nodrag">+ add effect</DropdownMenuTrigger>
                        <DropdownMenuContent container={root} align="center" className="fx-menu">
                            {MENU_GROUPS.map((g, i) => (
                                <DropdownMenuGroup key={g.label}>
                                    {i > 0 && <DropdownMenuSeparator />}
                                    <DropdownMenuLabel className="fx-menu__label">{g.label}</DropdownMenuLabel>
                                    {g.kinds.map((k) => (
                                        <DropdownMenuItem key={k} className="fx-menu__item"
                                            onSelect={() => setEffects([...effects, newEffect(k)])}>
                                            <span className="fx-menu__dot" aria-hidden="true" />
                                            <span className="fx-menu__name">{FILTERS[k].label}</span>
                                            {/* the Strudel function it becomes, e.g. Reverb -> .room */}
                                            <span className="fx-menu__short">.{k}</span>
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuGroup>
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
