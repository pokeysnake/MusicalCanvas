# Collaborative Music Canvas — plan reference (condensed from the vault note)

Multiplayer flowchart-style music editor. Nodes (Notes, Instrument, Filter, Output) + cables on a React Flow canvas. Graph compiles to Strudel and plays live in-page; everyone in a room edits the same graph in real time.

**Priority:** (1) concurrent editing, (2) Strudel playback, (3) everything else. MIDI import last/optional.
**Checkpoints:** MVP = end of Stage 4 (single user, graph -> sound, live strudel tab). Resume-ready = end of Stage 10.

## Stack
Next.js (App Router) + TS + React, `@xyflow/react`, `@strudel/web`, Web Audio (EQ), Vitest, FastAPI (WebSockets), Pydantic, PostgreSQL, pytest, Docker.

## Node rules
| Node | Inputs | Outputs | Fields |
|---|---|---|---|
| Notes | none | -> Instrument | name, pattern text (`c4 e4 [c4,e4,g4] ~`) |
| Instrument | <- Notes (1+) | -> Filter or Output | sound, mute/solo |
| Filter | <- Instrument or Filter (1+) | -> Filter or Output | type (lpf/hpf/bpf/room/delay/gain), value, Q |
| Output | <- Instrument or Filter (1+) | none | exactly one per room |

Enforced in UI (`isValidConnection`) AND server (`applyOp`): only those pairs, no cycles, no duplicate edges. Nodes not reaching Output are dimmed/silent.

## Compiler
Start at Output, build each input's expression recursively.
- Notes -> `note("...")`
- Instrument -> Notes inputs ordered top-to-bottom by canvas y, `cat(...)`, then `.s(sound)`
- Filter -> `stack(...inputs).lpf(800)` (single input: `input.lpf(800)`)
- Output -> `stack(...inputs)`
- Node feeding 2+ places -> named `const` once, reused

## Data model
```ts
type NodeType = "notes" | "instrument" | "filter" | "output";
type GraphNode = { id: string; type: NodeType; position: {x:number;y:number}; data: Record<string, string|number|boolean> };
type GraphEdge = { id: string; source: string; target: string };
type Settings  = { bpm: number; eq: { low: number; mid: number; high: number } };
type Doc = { nodes: Record<string, GraphNode>; edges: Record<string, GraphEdge>; settings: Settings };
```
Ops: addNode, moveNode, deleteNode (removes its edges), updateNodeData, connect, disconnect, setSetting. Each has an opId.

React Flow is a **controlled** component: nodes/edges derived from the doc; user action -> op -> doc -> re-render.

## Layout target
Top bar (BPM, Play/Stop) | right sidebar (collaborators, node palette, filters) | tabs graph/strudel | bottom EQ bar (L/M/H dials).

## Stages
0. Env, React Flow & Strudel hello world (+ FastAPI /health, layout rough-in)
1. Custom nodes, handles, palette drag-drop, isValidConnection, cycle check, dim unreachable
2. Doc model, ops, `applyOp` (pure) + graph.ts (`wouldCreateCycle`, `reachesOutput`, `inputsOf`), Vitest
3. Controlled rendering (doc <-> React Flow); one op per user action; moveNode on drag stop only
4. Compiler, live playback (debounced ~150ms), BPM, strudel tab, notation parser  **MVP**
5. WebSocket sync server (naive), FastAPI rooms, Python port of applyOp
6. Optimism + conflicts (confirmedDoc + pending[]), shared JSON fixtures for Vitest+pytest, convergence tests
7. Persistence (Postgres op log + snapshots), reconnect
8. Presence (cursors, drag previews, ~20-30Hz, ephemeral)
9. EQ dials (Web Audio biquads on master; 2h spike, fallback compiled tone control)
10. Tests, load benchmark, Docker, deploy, README + GIF  **Resume-ready** (Strudel is AGPL-3.0: keep repo public AGPL, credit Strudel)
11-15. Custom filters, custom instruments, step-grid notes, MIDI import, horizontal scaling.

## Conflict rules (Stage 6)
Cycle race: first accepted, second rejected. Connect to just-deleted node: rejected. Same node dragged / same field / dial / BPM: last writer wins. Duplicate cable: second rejected. Delete vs edit: delete wins.
