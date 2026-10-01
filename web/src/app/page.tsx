"use client";

import { useCallback, useState } from "react";
import {
    Background, Controls, ReactFlow,
    addEdge, useEdgesState, useNodesState, Position,
    type Connection, type Edge, type Node,
} from "@xyflow/react";
import { play, stop } from "@/audio/strudel"

import NotesNode from "@/nodes/NotesNode"; // needs `export default` in NotesNode.tsx
import InstrumentNode from "@/nodes/InstrumentNode";
import FilterNode from "@/nodes/FilterNode";


/* Node Config */
const initialNodes: Node[] = [
    {
        id: "n1",
        type: "notes",
        position: { x: 40, y: 60 },
        data: { name: "Melody", text: "c4 e4 [c4,e4,g4] ~" },
    },
    {
        id: "n2",
        type: "instrument",
        position: { x: 420, y: 60 },
        data: { sound: "sawtooth", muted: false, solo: false },
    },
    {
        id:"n3",
        type:"filter",
        position: { x: 680, y: 60 }, 
        data: { kind: "lpf", value: 800, q: 0.7 },
    },
];

const nodeTypes = { notes: NotesNode, instrument: InstrumentNode, filter: FilterNode }; //declared OUTSIDE component

/* Placeholder for edges content*/
const initialEdges: Edge[] = [{ id: "e1", source: "n1", target: "n2" }];
const HELLO = 'note("c4 e4 [c4,e4,g4] ~").s("triangle")';

/* BPM limits */
const BPM_MIN = 40;
const BPM_MAX = 240;
const BPM_DEFAULT = 120;


export default function Page() {
    /* State inside the component*/
    const [nodes, , onNodesChange] = useNodesState(initialNodes); /* blank skips setNodes which we dont need yet*/
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [tab, setTab] = useState<"graph" | "strudel">("graph");
    const [error, setError] = useState<string | null>(null);

    /* BPM: keep what's typed separate from the value we use, so the box can be empty while typing */
    const [bpmText, setBpmText] = useState(String(BPM_DEFAULT));
    const typed = Number(bpmText);
    const bpmValid = bpmText !== "" && typed >= BPM_MIN && typed <= BPM_MAX;
    const bpm = bpmValid ? typed : BPM_DEFAULT;

    const code = `setcpm(${bpm}/4)\n${HELLO}`;

    /* Handlers*/
    const onConnect = useCallback(
        (c: Connection) => setEdges((eds) => addEdge(c, eds)),
        [setEdges],
    );
    const onPlay = async () => {
        setError(null);
        try {
            await play(code);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };


    /* the JSX*/
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
                    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
                        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
                        onConnect={onConnect} colorMode="dark" fitView>
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
                <div className="chip">Notes</div>
                <div className="chip">Instrument</div>
                <h4>Filters</h4>
                <div className="chip">Low-pass</div>
                <div className="chip">High-pass</div>
                <div className="chip">Band-pass</div>
                <div className="chip">Reverb</div>
            </aside>
            <footer className="eq">
                <span>EQ</span><span>L</span><span>M</span><span>H</span>
                <span>(dials arrive in Stage 9)</span>
            </footer>
        </div>
    );
}