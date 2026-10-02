"use client";

import { useCallback, useMemo, useReducer, useState, type DragEvent } from "react";
import {
    Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow,
    type Connection, type Edge, type EdgeChange, type Node, type NodeChange,
} from "@xyflow/react";

import { nodesReachingOutput } from "@/model/graph";
import { applyOp } from "@/model/applyOp";
import { initialState, reducer } from "@/model/reducer";
import { emptyUi, toFlowEdges, toFlowNodes, type UiState } from "@/canvas/flow";
import { DispatchProvider } from "@/canvas/dispatch";
import { deleteOp, moveOp } from "@/canvas/ops";


import { play, stop } from "@/audio/strudel";

import NotesNode from "@/nodes/NotesNode";
import InstrumentNode from "@/nodes/InstrumentNode";
import FilterNode from "@/nodes/FilterNode";
import { FILTERS, type FilterKind } from "@/model/filters";
import { edgeId, type Doc, type GraphNode, type Position } from "@/model/types";
import { emptyDoc, OUTPUT_ID } from "@/model/doc";
import { DEFAULT_SOUND } from "@/model/sounds";
import OutputNode from "@/nodes/OutputNode";
import NotesEditor from "@/ui/NotesEditor";


/* ---------- Starting graph (what's on the canvas at page load) ---------- */
// built on emptyDoc() so the Output id and default settings match what the server creates in Stage 6
const base = emptyDoc();
const initialDoc: Doc = {
    ...base,
    nodes: {
        n1: { id: "n1", type: "notes",      position: { x: 40,   y: 60 }, data: { name: "Melody", text: "c4 e4 [c4,e4,g4] ~" } },
        n2: { id: "n2", type: "instrument", position: { x: 420,  y: 60 }, data: { sound: DEFAULT_SOUND, muted: false, solo: false } },
        n3: { id: "n3", type: "filter",     position: { x: 740,  y: 60 }, data: { kind: "lpf", value: 800, q: 0.7 } },
        [OUTPUT_ID]: { ...base.nodes[OUTPUT_ID], position: { x: 1040, y: 60 } },
    },
    edges: { [edgeId("n1", "n2")]: { id: edgeId("n1", "n2"), source: "n1", target: "n2" } },
};

const nodeTypes = {
    notes: NotesNode,
    instrument: InstrumentNode,
    filter: FilterNode,
    output: OutputNode,
}; // declared OUTSIDE the component so React Flow doesn't remount nodes every render

const HELLO = 'note("c4 e4 [c4,e4,g4] ~").s("triangle")';


/* ---------- Palette (the menu of things you can drag onto the canvas) ---------- */
// no Output chip: every room starts with exactly one and it can't be deleted, so adding one is always rejected
type PaletteItem = {
    type: "notes" | "instrument" | "filter";
    kind?: FilterKind;   // only for filters
    label: string;
};

const PALETTE_NODES: PaletteItem[] = [
    { type: "notes", label: "Notes" },
    { type: "instrument", label: "Instrument" },
];

// built from the FILTERS table, so a new filter type gets a chip automatically
const PALETTE_FILTERS: PaletteItem[] = (Object.keys(FILTERS) as FilterKind[]).map((k) => ({
    type: "filter", kind: k, label: FILTERS[k].label,
}));

// a freshly dropped node with its starting data (typed, so addNode gets a valid GraphNode)
function newNode(item: PaletteItem, id: string, position: Position): GraphNode {
    switch (item.type) {
        case "notes":      return { id, position, type: "notes", data: { name: "New melody", text: "c4 e4 g4 ~" } };
        case "instrument": return { id, position, type: "instrument", data: { sound: DEFAULT_SOUND, muted: false, solo: false } };
        case "filter": {
            const k = item.kind ?? "lpf";
            return { id, position, type: "filter", data: { kind: k, value: FILTERS[k].def, q: 0.7 } };
        }
    }
}

/** new Set with id added/removed; returns the same set when nothing changes (avoids a re-render) */
function withSelection(set: ReadonlySet<string>, id: string, on: boolean): ReadonlySet<string> {
    if (set.has(id) === on) return set;
    const next = new Set(set);
    if (on) next.add(id); else next.delete(id);
    return next;
}

const DRAG_TYPE ="application/musicalcanvas"; // custom type so random drags (text, files) are ignored


/* ---------- BPM limits ---------- */
const BPM_MIN = 40;
const BPM_MAX = 240;
const BPM_DEFAULT = 120;


/* =====================================================================
   Editor: the whole app. Lives inside ReactFlowProvider (see Page below)
   so it can call useReactFlow().
   ===================================================================== */
function Editor() {
    /* ---------- State ---------- */
    const [{ doc, error: opError }, dispatch] = useReducer(reducer, initialDoc, initialState);
    const [ui, setUi] = useState<UiState>(emptyUi);

    // reachability only depends on the doc, so drag frames skip the search
    const live = useMemo(
        () => nodesReachingOutput(Object.values(doc.nodes), Object.values(doc.edges)),
        [doc],
    );
    const nodes = useMemo(() => toFlowNodes(doc, ui, live), [doc, ui, live]);
    const edges = useMemo(() => toFlowEdges(doc, ui), [doc, ui]);
    const [tab, setTab] = useState<"graph" | "strudel">("graph");
    const [error, setError] = useState<string | null>(null);
    const { screenToFlowPosition } = useReactFlow();

    // which Notes node has the popup open; look it up in the doc each render so a deleted node closes it
    const [editingId, setEditingId] = useState<string | null>(null);
    const editing = editingId ? doc.nodes[editingId] : undefined;
    const onNodeDoubleClick = useCallback((_: unknown, node: Node) => {
        if (node.type === "notes") setEditingId(node.id);
    }, []);

    /* BPM: typed text kept separate from the value we use, so the box can be empty while typing */
    const [bpmText, setBpmText] = useState(String(BPM_DEFAULT));
    const typed = Number(bpmText);
    const bpmValid = bpmText !== "" && typed >= BPM_MIN && typed <= BPM_MAX;
    const bpm = bpmValid ? typed : BPM_DEFAULT;

    const code = `setcpm(${bpm}/4)\n${HELLO}`;

    /* ---------- React Flow changes: UI state only, never the Doc ---------- */
    // "remove" changes are ignored here; deletes go through onDelete as ops
    const onNodesChange = useCallback((changes: NodeChange[]) => {
        setUi((prev) => {
            let { drag, selected, dims } = prev;
            for (const c of changes) {
                if (c.type === "position" && c.position) {
                    drag = { ...drag, [c.id]: c.position };
                } else if (c.type === "dimensions" && c.dimensions) {
                    dims = { ...dims, [c.id]: c.dimensions };
                } else if (c.type === "select") {
                    selected = withSelection(selected, c.id, c.selected);
                }
            }
            return { drag, selected, dims };
        });
    }, []);

    const onEdgesChange = useCallback((changes: EdgeChange[]) => {
        setUi((prev) => {
            let { selected } = prev;
            for (const c of changes) {
                if (c.type === "select") selected = withSelection(selected, c.id, c.selected);
            }
            return selected === prev.selected ? prev : { ...prev, selected };
        });
    }, []);

    // one moveNodes op for the whole drag (even with several nodes selected), and clear the overlay in
    // the same handler (React batches both, so no snap-back; if the op is rejected, clearing the
    // overlay snaps the nodes back to their Doc positions)
    const onNodeDragStop = useCallback((_: unknown, _node: Node, dragged: Node[]) => {
        dispatch(moveOp(dragged));
        setUi((prev) => {
            const drag = { ...prev.drag };
            for (const n of dragged) delete drag[n.id];
            return { ...prev, drag };
        });
    }, []);

    /* ---------- Connections ---------- */
    const onConnect = useCallback((c: Connection) => {
        dispatch({ type: "connect", opId: crypto.randomUUID(), source: c.source, target: c.target });
    }, []);

    // Refuses a connection while it's being dragged (the line won't snap to a bad handle).
    // applyOp is pure, so we run a throwaway connect op and only look at .ok: one set of rules, in the model.
    const isValidConnection = useCallback((c: Connection | Edge) =>
        applyOp(doc, { type: "connect", opId: "check", source: c.source, target: c.target }).ok,
    [doc]);

    /* ---------- Deleting ---------- */
    // Runs before anything is removed: drop the Output (it can't be deleted, so the user never sees a rejection),
    // and drop edges that were only included because they touch the Output.
    const onBeforeDelete = useCallback(async ({ nodes: ns, edges: es }: { nodes: Node[]; edges: Edge[] }) => {
        const keep = ns.filter((n) => n.type !== "output");
        const kept = new Set(keep.map((n) => n.id));
        const keepEdges = es.filter((e) => e.selected || kept.has(e.source) || kept.has(e.target));
        if (keep.length === 0 && keepEdges.length === 0) return false;
        return { nodes: keep, edges: keepEdges };
    }, []);

    // One handler for nodes + edges, one deleteElements op per delete action.
    // React Flow also hands us edges attached to deleted nodes; the op removes those anyway, so overlap is harmless.
    const onDelete = useCallback(({ nodes: ns, edges: es }: { nodes: Node[]; edges: Edge[] }) => {
        dispatch(deleteOp(ns, es));
        // prune UI state for things that no longer exist
        setUi((prev) => {
            const removed = new Set([...ns.map((n) => n.id), ...es.map((e) => e.id)]);
            const drop = <T,>(rec: Record<string, T>) =>
                Object.fromEntries(Object.entries(rec).filter(([id]) => !removed.has(id)));
            return {
                drag: drop(prev.drag),
                dims: drop(prev.dims),
                selected: new Set([...prev.selected].filter((id) => !removed.has(id))),
            };
        });
    }, []);

    /* ---------- Playback ---------- */
    const onPlay = async () => {
        setError(null);
        try {
            await play(code);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    /* ---------- Palette drag-and-drop ---------- */
    // 1. chip starts dragging: write "what node am I" onto the drag
    const onDragStart = (e: DragEvent, item: PaletteItem) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
        e.dataTransfer.effectAllowed = "move";
    };

    // 2. dragging over the canvas: REQUIRED preventDefault, or the browser refuses the drop
    const onDragOver = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    }, []);

    // 3. dropped: read the item, convert mouse position to canvas coords, add the node
    const onDrop = useCallback((e: DragEvent) => {
        e.preventDefault();
        const raw = e.dataTransfer.getData(DRAG_TYPE);
        if (!raw) return; // not one of our chips

        const item = JSON.parse(raw) as PaletteItem;

        // screen pixels -> canvas coordinates (accounts for pan + zoom)
        const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });

        dispatch({ type: "addNode", opId: crypto.randomUUID(), node: newNode(item, crypto.randomUUID(), position) });
    }, [screenToFlowPosition]);


    /* ---------- JSX ---------- */
    // DispatchProvider lets node components send ops (React Flow renders them, so no props from here)
    return (
        <DispatchProvider dispatch={dispatch}>
        <div className="app">
            <header className="topbar">
                <label>
                    BPM{" "}
                    <input type="number" min={BPM_MIN} max={BPM_MAX} value={bpmText}
                        aria-invalid={!bpmValid}
                        onChange={(e) => setBpmText(e.target.value)}
                        onBlur={() => { if (!bpmValid) setBpmText(String(bpm)); }} />
                </label>
                <button onClick={onPlay}>▶ Play</button>
                <button className="secondary" onClick={() => stop()}>■ Stop</button>
                {(opError ?? error) && <span className="err">{opError ?? error}</span>}
            </header>

            <section className="main">
                <div className="tabs">
                    <button className={tab === "graph" ? "on" : ""} onClick={() => setTab("graph")}>graph</button>
                    <button className={tab === "strudel" ? "on" : ""} onClick={() => setTab("strudel")}>strudel</button>
                </div>

                {/* Canvas stays mounted and is only hidden, so zoom/pan survive tab switches */}
                <div className="canvas" style={{ display: tab === "graph" ? "block" : "none" }}>
                    <ReactFlow
                        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
                        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
                        onNodeDragStop={onNodeDragStop} onNodeDoubleClick={onNodeDoubleClick}
                        zoomOnDoubleClick={false}
                        onBeforeDelete={onBeforeDelete} onDelete={onDelete}
                        onConnect={onConnect} isValidConnection={isValidConnection}
                        onDragOver={onDragOver} onDrop={onDrop}
                        colorMode="dark" fitView
                    >
                        <Background />
                        <Controls />
                    </ReactFlow>
                </div>
                {tab === "strudel" && <pre className="code">{code}</pre>}
            </section>

            <aside className="side">
                <h4>Collaborators</h4>
                <div className="who">● You</div>

                <h4>Nodes</h4>
                {PALETTE_NODES.map((item) => (
                    <div key={item.type} className="chip" draggable
                        onDragStart={(e) => onDragStart(e, item)}>
                        {item.label}
                    </div>
                ))}

                <h4>Filters</h4>
                {PALETTE_FILTERS.map((item) => (
                    <div key={item.kind} className="chip" draggable
                        onDragStart={(e) => onDragStart(e, item)}>
                        {item.label}
                    </div>
                ))}
            </aside>

            <footer className="eq">
                <span>EQ</span><span>L</span><span>M</span><span>H</span>
                <span>(dials arrive in Stage 9)</span>
            </footer>

            {/* outside <ReactFlow>, so typing in it never reaches the canvas */}
            {editing?.type === "notes" && (
                <NotesEditor key={editing.id} nodeId={editing.id} name={editing.data.name} text={editing.data.text}
                    onClose={() => setEditingId(null)} />
            )}
        </div>
        </DispatchProvider>
    );
}


/* =====================================================================
   Page: what Next.js renders. Wraps Editor in ReactFlowProvider so
   useReactFlow() (screenToFlowPosition) works inside Editor.
   ===================================================================== */
export default function Page() {
    return (
        <ReactFlowProvider>
            <Editor />
        </ReactFlowProvider>
    );
}