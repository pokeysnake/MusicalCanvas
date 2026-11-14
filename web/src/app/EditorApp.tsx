"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
    Background, BackgroundVariant, ConnectionLineType, Controls, NodeToolbar, ReactFlow, ReactFlowProvider, useReactFlow,
    type Connection, type Edge, type EdgeChange, type Node, type NodeChange,
} from "@xyflow/react";

import { nodesReachingOutput } from "@/model/graph";
import { applyOp } from "@/model/applyOp";
import { initialSync, syncReducer } from "@/sync/optimistic";
import { emptyUi, GROUP_PREFIX, toFlowEdges, toFlowNodes, type UiState } from "@/canvas/flow";
import { DispatchProvider } from "@/canvas/dispatch";
import { partRefs, PartRefsProvider } from "@/canvas/partRefs";
import { bpmOp, deleteOp, moveOp } from "@/canvas/ops";
import { catGroups, dragHint, snapPositions } from "@/canvas/sequence";


import { play, setVolume, stop } from "@/audio/strudel";

import NotesNode from "@/nodes/NotesNode";
import InstrumentNode from "@/nodes/InstrumentNode";
import FilterNode from "@/nodes/FilterNode";
import FxRackNode, { newEffect } from "@/nodes/FxRackNode";
import type { Op, Position } from "@/model/types";
import { DRAG_TYPE, newNode, PALETTE_FILTERS, PALETTE_NODES, type PaletteItem } from "@/canvas/palette";
import { starterDoc } from "@/model/starter";
import OutputNode from "@/nodes/OutputNode";
import CatGroupNode from "@/nodes/CatGroupNode";
import CableEdge from "@/canvas/CableEdge";
import NotesEditor, { type Rect } from "@/ui/NotesEditor";
import ShareButton from "@/ui/ShareButton";
import { Square } from "lucide-react";
import { BEATS_PER_BAR, compile } from "@/model/compile";
import { issueText } from "@/canvas/issues";
import { useRoomSocket } from "@/sync/useRoomSocket";


/* ---------- Starting graph (what's on the canvas at page load) ---------- */
// the demo graph from shared/fixtures/starter.json, the same ops the server seeds a new room with
const initialDoc = starterDoc();

const nodeTypes = {
    notes: NotesNode,
    instrument: InstrumentNode,
    filter: FilterNode,
    output: OutputNode,
    fx: FxRackNode, // several effects in one node
    catGroup: CatGroupNode, // frame behind a cat sequence; drawn from the wiring, not stored in the Doc
}; // declared OUTSIDE the component so React Flow doesn't remount nodes every render
const edgeTypes = { cable: CableEdge }; // every wire is a patch cable (canvas/CableEdge.tsx)


/** new Set with id added/removed; returns the same set when nothing changes (avoids a re-render) */
function withSelection(set: ReadonlySet<string>, id: string, on: boolean): ReadonlySet<string> {
    if (set.has(id) === on) return set;
    const next = new Set(set);
    if (on) next.add(id); else next.delete(id);
    return next;
}


// at most `digits` decimals, no trailing zeros: 30, 2.5, 1.33
const round = (n: number, digits: number) => String(Number(n.toFixed(digits)));

/* ---------- BPM limits ---------- */
const BPM_MIN = 40;
const BPM_MAX = 240;


/* =====================================================================
   Editor: the whole app. Lives inside ReactFlowProvider (see Page below)
   so it can call useReactFlow().
   ===================================================================== */
function Editor({ roomId }: { roomId: string | null }) {
    /* ---------- State ---------- */
    const [{ doc, error: opError, version }, act] = useReducer(syncReducer, initialDoc, initialSync);

    /* Optimistic (Stage 6): every op shows up on screen at once.
       Room: send it first to learn its clientSeq, then apply it as pending; the echo confirms it,
       a reject rolls it back (see sync/optimistic.ts). If the socket isn't open the op is dropped.
       Solo (roomId null): it goes straight into the doc. Either way the rest of the app just calls dispatch(op). */
    const { status, send } = useRoomSocket(roomId, act);
    const dispatch = useCallback((op: Op) => {
        if (!roomId) return act({ type: "local", op, seq: null });
        const seq = send(op);
        if (seq !== null) act({ type: "local", op, seq });
    }, [roomId, send, act]);
    const router = useRouter();
    const [ui, setUi] = useState<UiState>(emptyUi);

    // reachability only depends on the doc, so drag frames skip the search
    const live = useMemo(
        () => nodesReachingOutput(Object.values(doc.nodes), Object.values(doc.edges)),
        [doc],
    );

    // the Strudel code for the whole graph; recompiled only when the doc changes
    const { code, issues } = useMemo(() => compile(doc), [doc]);
    const issueLine = issues.map((i) => issueText(doc, i)).join(" · ");
    // cat sequences to frame; uses live drag positions so the frame stretches and renumbers mid-drag
    const groups = useMemo(() => catGroups(doc, ui.drag, (id) => ui.dims[id]), [doc, ui.drag, ui.dims]);
    const nodes = useMemo(() => toFlowNodes(doc, ui, live, groups), [doc, ui, live, groups]);
    const edges = useMemo(() => toFlowEdges(doc, ui), [doc, ui]);
    // part numbers (N1, I1 ...) only change when parts are added or removed, so the context value is keyed on
    // their JSON: an ordinary edit or move keeps the same object and doesn't re-render every node
    const refsJson = JSON.stringify(partRefs(doc));
    const refs = useMemo(() => JSON.parse(refsJson) as Record<string, string>, [refsJson]);
    const [tab, setTab] = useState<"graph" | "strudel">("graph");
    const [error, setError] = useState<string | null>(null);
    const { screenToFlowPosition, getNode } = useReactFlow();

    // the node under the cursor during a drag (others may move with it); the tooltip sits on this one
    const [leadId, setLeadId] = useState<string | null>(null);
    const hint = useMemo(
        () => (leadId && ui.drag[leadId] ? dragHint(doc, leadId, ui.drag) : null),
        [doc, leadId, ui.drag],
    );

    // which Notes node has the popup open; look it up in the doc each render so a deleted node closes it
    // (also remembers where the node was on screen, so the popup can grow out of it)
    const [editingAt, setEditingAt] = useState<{ id: string; from: Rect | null } | null>(null);
    const editing = editingAt ? doc.nodes[editingAt.id] : undefined;
    const onNodeDoubleClick = useCallback((e: React.MouseEvent, node: Node) => {
        if (node.type !== "notes") return;
        const el = (e.target as Element).closest(".react-flow__node");
        const r = el?.getBoundingClientRect();
        setEditingAt({ id: node.id, from: r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null });
    }, []);

    /* BPM: a local draft only while typing (same pattern as FilterNode). When not typing (draft = null) the box
       shows the doc's BPM, so a change from another client (Stage 5) shows up with no extra syncing. */
    const bpm = doc.settings.bpm;
    const [bpmDraft, setBpmDraft] = useState<string | null>(null);
    const bpmText = bpmDraft ?? String(bpm);
    const typed = Number(bpmText);
    const bpmValid = bpmText !== "" && typed >= BPM_MIN && typed <= BPM_MAX;

    // blur/Enter: send one op (even an out-of-range one, so opError says why), then drop the draft.
    // A rejected op leaves the doc as it was, so dropping the draft is also the revert.
    const commitBpm = () => {
        const op = bpmOp(bpmText, bpm);
        if (op) dispatch(op);
        setBpmDraft(null);
    };

    /* ---------- React Flow changes: UI state only, never the Doc ---------- */
    // Dragging a cat group by its tab moves all its Notes as one column: one moveNodes op on drop, no snap.
    // Holds the frame's start position and each member's start position for the drag in progress.
    const frameDrag = useRef<{ id: string; start: Position; members: Record<string, Position> } | null>(null);

    // "remove" changes are ignored here; deletes go through onDelete as ops
    const onNodesChange = useCallback((changes: NodeChange[]) => {
        setUi((prev) => {
            let { drag, selected, dims } = prev;
            for (const c of changes) {
                // a cat group frame being dragged by its tab: move every Notes in it by the same amount
                // (the frame itself isn't stored; it's redrawn around the moved Notes)
                if (c.type === "position" && c.position && c.id.startsWith(GROUP_PREFIX)) {
                    const fd = frameDrag.current;
                    if (fd?.id !== c.id) continue;
                    const dx = c.position.x - fd.start.x, dy = c.position.y - fd.start.y;
                    drag = { ...drag };
                    for (const [id, p] of Object.entries(fd.members)) drag[id] = { x: p.x + dx, y: p.y + dy };
                } else if (c.type === "position" && c.position) {
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
    // overlay snaps the nodes back to their Doc positions).
    // Notes in a cat sequence snap into a tidy column in their new play order; the snap rides in the same op.
    const onNodeDragStart = useCallback((_: unknown, node: Node) => {
        if (node.id.startsWith(GROUP_PREFIX)) {
            const g = groups.find((x) => GROUP_PREFIX + x.instrumentId === node.id);
            if (g) {
                const members = Object.fromEntries(g.order.map((id) => [id, doc.nodes[id].position]));
                frameDrag.current = { id: node.id, start: node.position, members };
            }
            return; // no drag tooltip for the frame
        }
        setLeadId(node.id);
    }, [groups, doc]);

    const onNodeDragStop = useCallback((_: unknown, node: Node, dragged: Node[]) => {
        const fd = frameDrag.current;
        if (fd && node.id === fd.id) {
            frameDrag.current = null;
            const dx = node.position.x - fd.start.x, dy = node.position.y - fd.start.y;
            const moved = Object.entries(fd.members).map(([id, p]) => ({ id, position: { x: p.x + dx, y: p.y + dy } }));
            if (dx !== 0 || dy !== 0) dispatch(moveOp(moved));
            setUi((prev) => {
                const drag = { ...prev.drag };
                for (const id of [fd.id, ...Object.keys(fd.members)]) delete drag[id];
                return { ...prev, drag };
            });
            return;
        }

        const dropped = Object.fromEntries(dragged.map((n) => [n.id, n.position]));
        const snap = snapPositions(doc, dropped, (id) => getNode(id)?.measured?.height);
        dispatch(moveOp(dragged, snap));
        setLeadId(null);
        setUi((prev) => {
            const drag = { ...prev.drag };
            for (const n of dragged) delete drag[n.id];
            return { ...prev, drag };
        });
    }, [dispatch, doc, getNode]);

    /* ---------- Connections ---------- */
    const onConnect = useCallback((c: Connection) => {
        dispatch({ type: "connect", opId: crypto.randomUUID(), source: c.source, target: c.target });
    }, [dispatch]);

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
    }, [dispatch]);

    /* ---------- Playback ---------- */
    const [playing, setPlaying] = useState(false);
    // the only place that calls play() --> runs on Play and again whenever the doc compiles to new code while playing
    useEffect(() => {
        if (!playing) return;
        let current = true;
        play(code).then(
            () => { if (current) setError(null); },
            (e) => {
                if (!current) return;
                setError(e instanceof Error ? e.message : String(e));
                setPlaying(false); // e.g. samples failed to load: drop back to stopped so Play can retry
            },
        );
        return () => { current = false; };
    }, [code, playing]);

    const onPlay = () => setPlaying(true);
    const onStop = () => { setPlaying(false); stop(); }


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

        // an effect chip dropped ON an FX rack becomes a new row in that rack (one updateNodeData op)
        const rackId = (e.target as Element).closest(".react-flow__node-fx")?.getAttribute("data-id");
        const rack = rackId ? doc.nodes[rackId] : undefined;
        if (rack?.type === "fx" && item.type === "filter" && item.kind) {
            dispatch({
                type: "updateNodeData", opId: crypto.randomUUID(), id: rack.id,
                patch: { effects: [...rack.data.effects, newEffect(item.kind)] },
            });
            return;
        }

        // screen pixels -> canvas coordinates (accounts for pan + zoom)
        const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });

        dispatch({ type: "addNode", opId: crypto.randomUUID(), node: newNode(item, crypto.randomUUID(), position) });
    }, [screenToFlowPosition, dispatch, doc]);


    /* ---------- JSX ---------- */
    // DispatchProvider lets node components send ops (React Flow renders them, so no props from here)
    return (
        <DispatchProvider dispatch={dispatch}>
          <PartRefsProvider refs={refs}>
            {/* --beat: one beat in seconds, so the wires' play pulse moves in time with the song (theme.css) */}
            <div className={"app" + (playing ? " is-playing" : "")} style={{ "--beat": `${60 / bpm}s` } as CSSProperties}>
                <header className="topbar">
                    <label>
                        BPM{" "}
                        <input type="number" min={BPM_MIN} max={BPM_MAX} value={bpmText}
                            aria-invalid={!bpmValid}
                            onChange={(e) => {
                                // typing sets inputType; the spinner arrows and Up/Down keys don't. Those are a finished
                                // choice, so send the op now instead of waiting for blur (else other clients never see it)
                                if ((e.nativeEvent as InputEvent).inputType) { setBpmDraft(e.target.value); return; }
                                const op = bpmOp(e.target.value, bpm);
                                if (op) dispatch(op);
                                setBpmDraft(null);
                            }}
                            onBlur={commitBpm}
                            // Enter just blurs, so the op is sent from onBlur only (never twice)
                            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
                    </label>
                    {/* what the BPM means for Strudel: one cycle = one bar of BEATS_PER_BAR beats, so cpm = bpm / BEATS_PER_BAR */}
                    <span className="tempo-info"
                        title={`Strudel counts time in cycles. Here one cycle is one bar of ${BEATS_PER_BAR} beats, so cycles per minute (CPM) = BPM ÷ ${BEATS_PER_BAR}. Everything in a Notes node plays within one bar.`}>
                        {BEATS_PER_BAR} beats/bar · {round(bpm / BEATS_PER_BAR, 2)} CPM · {round((60 * BEATS_PER_BAR) / bpm, 2)}s per bar
                    </span>
                    {/* square keys that push down when pressed; Play's red lamp lights and pulses while the song plays */}
                    <button type="button" className={"btn btn--play" + (playing ? " is-on" : "")} onClick={onPlay}>
                        <span className="btn__lamp" aria-hidden="true" /> Play
                    </button>
                    <button type="button" className="btn" onClick={onStop}>
                        <Square size={9} fill="currentColor" /> Stop
                    </button>
                    {/* per-listener volume: local, never an op, so it isn't shared with collaborators */}
                    <label className="vol">
                        Vol
                        <input type="range" min={0} max={1} step={0.01} defaultValue={0.5}
                            aria-label="Volume"
                            onChange={(e) => {
                                const v = Number(e.target.value);
                                setVolume(v);
                                // colour the track up to the thumb (see .topbar input[type="range"] in globals.css)
                                e.currentTarget.style.setProperty("--fill", `${v * 100}%`);
                            }} />
                    </label>
                    {/* sharing: solo mode offers a new room; inside a room, show the connection and a copy-link button */}
                    {roomId && <span className="room-status" data-status={status}>{status}</span>}
                    <ShareButton roomId={roomId} onShare={() => router.push(`/room/${crypto.randomUUID()}`)} />
                    {/* three independent sources, so one can never hide another:
                        compile issues (the song still plays without those nodes), a rejected op, and playback */}
                    <div className="errors">
                        {issueLine && <span className="err" title={issueLine}>{issueLine}</span>}
                        {opError && <span className="err" title={opError}>{opError}</span>}
                        {error && <span className="err" title={error}>Playback: {error}</span>}
                    </div>
                </header>

                <section className="main">
                    <div className="tabs">
                        <button className={tab === "graph" ? "on" : ""} onClick={() => setTab("graph")}>graph</button>
                        <button className={tab === "strudel" ? "on" : ""} onClick={() => setTab("strudel")}>strudel</button>
                    </div>

                    {/* Canvas stays mounted and is only hidden, so zoom/pan survive tab switches */}
                    <div className="canvas" style={{ display: tab === "graph" ? "block" : "none" }}>
                        <ReactFlow
                            nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
                            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
                            onNodeDragStart={onNodeDragStart} onNodeDragStop={onNodeDragStop}
                            onNodeDoubleClick={onNodeDoubleClick}
                            zoomOnDoubleClick={false}
                            onBeforeDelete={onBeforeDelete} onDelete={onDelete}
                            onConnect={onConnect} isValidConnection={isValidConnection}
                            onDragOver={onDragOver} onDrop={onDrop}
                            connectionLineType={ConnectionLineType.Step}
                            colorMode="dark" fitView
                        >
                            {/* graph paper: fine 8px grid under a heavier 40px one; both pan and zoom with the drawing */}
                            <Background id="grid-minor" variant={BackgroundVariant.Lines} gap={8} lineWidth={1} color="var(--fainter)" />
                            <Background id="grid-major" variant={BackgroundVariant.Lines} gap={40} lineWidth={1} color="var(--faint)" />
                            <Controls showInteractive={false} />
                            {/* drag tooltip: where a Notes plays in its cat sequence, or why height doesn't matter */}
                            {hint && leadId && (
                                <NodeToolbar nodeId={leadId} isVisible
                                    className={hint.reorder ? "drag-hint is-reorder" : "drag-hint"}>
                                    {hint.text}
                                </NodeToolbar>
                            )}
                        </ReactFlow>
                        {/* drafting title block: which drawing this is and its revision (the op-log version) */}
                        <div className="titleblock" aria-hidden="true">
                            <span>Title</span><span>music canvas / {roomId ? `room ${roomId.slice(0, 4)}` : "solo"}</span>
                            <span>Rev</span><span>v{version} (ops)</span>
                            <span>Parts</span><span>{Object.keys(doc.nodes).length}</span>
                        </div>
                    </div>
                    {tab === "strudel" && <pre className="code">{code}</pre>}
                </section>

                <aside className="side">
                    <div className="brand">Music Canvas</div>
                    <h4>Collaborators</h4>
                    <div className="who">you</div>

                    <h4>Nodes</h4>
                    {PALETTE_NODES.map((item) => (
                        <div key={item.type} className="chip" data-type={item.type} draggable
                            onDragStart={(e) => onDragStart(e, item)}>
                            {item.label}
                        </div>
                    ))}

                    <h4>Filters</h4>
                    {PALETTE_FILTERS.map((item) => (
                        <div key={item.kind} className="chip" data-type="filter" draggable
                            onDragStart={(e) => onDragStart(e, item)}>
                            {item.label}
                        </div>
                    ))}
                </aside>

                {/* AGPL-3.0 (sections 6d and 13): users of the hosted app get clear directions to its source */}
                <footer className="credits">
                    <span>made with <a href="https://strudel.cc" target="_blank" rel="noreferrer">strudel</a> (AGPL-3.0)</span>
                    <span>this app is AGPL-3.0 too · <a href="https://github.com/pokeysnake/MusicalCanvas" target="_blank" rel="noreferrer">source code</a></span>
                </footer>

                {/* outside <ReactFlow>, so typing in it never reaches the canvas */}
                {editing?.type === "notes" && (
                    <NotesEditor key={editing.id} nodeId={editing.id} name={editing.data.name} text={editing.data.text}
                        from={editingAt?.from ?? null} onClose={() => setEditingAt(null)} />
                )}
            </div>
          </PartRefsProvider>
        </DispatchProvider>
    );
}


/* =====================================================================
   Page: what Next.js renders. Wraps Editor in ReactFlowProvider so
   useReactFlow() (screenToFlowPosition) works inside Editor.
   ===================================================================== */
export default function EditorApp({ roomId }: { roomId: string | null }) {
    return (
        <ReactFlowProvider>
            <Editor roomId={roomId} />
        </ReactFlowProvider>
    );
}