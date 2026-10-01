"use client";

import { useCallback, useState, type DragEvent } from "react";
import {
    Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow,
    addEdge, getOutgoers, useEdgesState, useNodesState,
    type Connection, type Edge, type Node,
} from "@xyflow/react";


import { useMemo } from "react";
import { nodesReachingOutput } from "@/model/graph";


import { play, stop } from "@/audio/strudel";

import NotesNode from "@/nodes/NotesNode";
import InstrumentNode from "@/nodes/InstrumentNode";
import FilterNode, { FILTERS, type FilterKind } from "@/nodes/FilterNode";
import OutputNode from "@/nodes/OutputNode";


/* ---------- Starting graph (what's on the canvas at page load) ---------- */
const initialNodes: Node[] = [
    { id: "n1", type: "notes",      position: { x: 40,   y: 60 }, data: { name: "Melody", text: "c4 e4 [c4,e4,g4] ~" } },
    { id: "n2", type: "instrument", position: { x: 420,  y: 60 }, data: { sound: "triangle", muted: false, solo: false } },
    { id: "n3", type: "filter",     position: { x: 740,  y: 60 }, data: { kind: "lpf", value: 800, q: 0.7 } },
    { id: "n4", type: "output",     position: { x: 1040, y: 60 }, data: {} },
];

const initialEdges: Edge[] = [{ id: "e1", source: "n1", target: "n2" }];

const nodeTypes = {
    notes: NotesNode,
    instrument: InstrumentNode,
    filter: FilterNode,
    output: OutputNode,
}; // declared OUTSIDE the component so React Flow doesn't remount nodes every render

/* ---------- Connection rules: which node type may feed which ---------- */
const ALLOWED_TARGETS: Record<string, string[]> = {
    notes:      ["instrument"],
    instrument: ["filter", "output"],
    filter:     ["filter", "output"],
    output:     [], // end of the chain, nothing comes out
};

const HELLO = 'note("c4 e4 [c4,e4,g4] ~").s("triangle")';


/* ---------- Palette (the menu of things you can drag onto the canvas) ---------- */
type PaletteItem = {
    type: "notes" | "instrument" | "filter" | "output";
    kind?: FilterKind;   // only for filters
    label: string;
};

const PALETTE_NODES: PaletteItem[] = [
    { type: "notes", label: "Notes" },
    { type: "instrument", label: "Instrument" },
    { type: "output", label: "Output" },
];

// built from the FILTERS table, so a new filter type gets a chip automatically
const PALETTE_FILTERS: PaletteItem[] = (Object.keys(FILTERS) as FilterKind[]).map((k) => ({
    type: "filter", kind: k, label: FILTERS[k].label,
}));

// starting data for a freshly dropped node
function defaultData(item: PaletteItem): Record<string, unknown> {
    switch (item.type) {
        case "notes":      return { name: "New melody", text: "c4 e4 g4 ~" };
        case "instrument": return { sound: "triangle", muted: false, solo: false };
        case "filter": {
            const k = item.kind ?? "lpf";
            return { kind: k, value: FILTERS[k].def, q: 0.7 };
        }
        case "output":     return {};
    }
}

const DRAG_TYPE = "application/musicalcanvas"; // custom type so random drags (text, files) are ignored


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
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const live = useMemo(() => nodesReachingOutput(nodes,edges), [nodes,edges]);
    //same nodes but unreachable ones get a CSS class on React Flow wrapper
    const displayNodes = useMemo(
        () => nodes.map((n)=> ({...n, className: live.has(n.id) ? undefined: "is-silent"})),
        [nodes,live],
    );
    const [tab, setTab] = useState<"graph" | "strudel">("graph");
    const [error, setError] = useState<string | null>(null);
    const { screenToFlowPosition } = useReactFlow();

    /* BPM: typed text kept separate from the value we use, so the box can be empty while typing */
    const [bpmText, setBpmText] = useState(String(BPM_DEFAULT));
    const typed = Number(bpmText);
    const bpmValid = bpmText !== "" && typed >= BPM_MIN && typed <= BPM_MAX;
    const bpm = bpmValid ? typed : BPM_DEFAULT;

    const code = `setcpm(${bpm}/4)\n${HELLO}`;

    /* ---------- Connections ---------- */
    const onConnect = useCallback(
        (c: Connection) => setEdges((eds) => addEdge(c, eds)),
        [setEdges],
    );

    // Refuses a connection while it's being dragged (the line won't snap to a bad handle)
    const isValidConnection = useCallback((c: Connection | Edge) => {
        const source = nodes.find((n) => n.id === c.source);
        const target = nodes.find((n) => n.id === c.target);
        if (!source || !target || source.id === target.id) return false;

        // type rules
        if (!ALLOWED_TARGETS[source.type ?? ""]?.includes(target.type ?? "")) return false;

        // no duplicate edge
        if (edges.some((e) => e.source === source.id && e.target === target.id)) return false;

        // cycle check: if the target can already reach the source, this edge would close a loop
        const seen = new Set<string>();
        const reaches = (node: Node): boolean => {
            if (node.id === source.id) return true;
            if (seen.has(node.id)) return false;
            seen.add(node.id);
            return getOutgoers(node, nodes, edges).some(reaches);
        };
        return !reaches(target);
    }, [nodes, edges]);

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

        // rule: only one Output per room
        if (item.type === "output" && nodes.some((n) => n.type === "output")) {
            setError("There can only be one Output node.");
            return;
        }

        // screen pixels -> canvas coordinates (accounts for pan + zoom)
        const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });

        setError(null);
        setNodes((nds) => nds.concat({
            id: crypto.randomUUID(),
            type: item.type,
            position,
            data: defaultData(item),
        }));
        // Stage 3: this setNodes becomes an `addNode` op on the doc model
    }, [nodes, screenToFlowPosition, setNodes]);


    /* ---------- JSX ---------- */
    return (
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
                {error && <span className="err">{error}</span>}
            </header>

            <section className="main">
                <div className="tabs">
                    <button className={tab === "graph" ? "on" : ""} onClick={() => setTab("graph")}>graph</button>
                    <button className={tab === "strudel" ? "on" : ""} onClick={() => setTab("strudel")}>strudel</button>
                </div>

                {/* Canvas stays mounted and is only hidden, so zoom/pan survive tab switches */}
                <div className="canvas" style={{ display: tab === "graph" ? "block" : "none" }}>
                    <ReactFlow
                        nodes={displayNodes} edges={edges} nodeTypes={nodeTypes}
                        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
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
        </div>
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