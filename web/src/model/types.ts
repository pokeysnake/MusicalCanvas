// type-only import
import type { FilterKind } from "@/model/filters";

// these match exactly what the four node components alread read
export type NotesData = { name: string; text: string };
export type InstrumentData = { sound: string; muted: boolean; solo: boolean };
export type FilterData = { kind: FilterKind; value: number; q: number };
export type OutputData = Record<string, never>; //an object with no fields

// Node itself as a discriminated union
export type Position = { x: number; y: number };

type NodeBase = { id: string; position: Position };

export type GraphNode =
  | (NodeBase & { type: "notes"; data: NotesData })
  | (NodeBase & { type: "instrument"; data: InstrumentData })
  | (NodeBase & { type: "filter"; data: FilterData })
  | (NodeBase & { type: "output"; data: OutputData });

export type NodeType = GraphNode["type"]; // "notes" | "instrument" | "filter" | "output"

// Edges with deterministic IDs
/**
 *  n1 -> n2 instead of a random.UUID
 *  - dupes cant happen because the same connecting cable always gets the same ID so a dupe check is simply "does this ID already exist"
 *  - two clients agree on the ID because if nick and sam both draw n1->n2 at the same moment, both generate "n1->n2"
 *    the server accepts the first and rejects the second as a duplicate, with no confusion over two different random IDs for the same cable
 *  - nodes also still use crypto.randomUUID() so 2 separately dropped nodes are actually still different things
 */

export type GraphEdge = { id: string; source: string; target: string};
export const edgeId = (source: string, target: string) =>
  `${source}->${target}`;

// Room settings and the whole doc
export type Settings = {
  bpm: number;
  eq: { low: number; mid: number; high: number };
};

/**
 *  Uses a Record (a map) instead of arrays
 *  - every op names an ID (move node X, delete edge Y, etc)
 *  - with a map, finding it is one lookup --> doc.nodes[id], with no searching needed
 *  - when 2 users edit different nodes theyre touching different keys still which keeps conflicts simple
 *
 */
export type Doc = {
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
  settings: Settings;
};

// Ops --> complete list of ways the song can change
type OpBase = { opId: string }; //unique per op; used for de-duping later

export type NodePatch = Partial<NotesData & InstrumentData & FilterData>;

export type Op =
  | (OpBase & { type: "addNode"; node: GraphNode })
  | (OpBase & { type: "moveNodes"; positions: Record<string, Position> }) // one drag = one op, even with several nodes selected
  | (OpBase & { type: "deleteElements"; nodeIds: string[]; edgeIds: string[] }) // one delete action = one op
  | (OpBase & { type: "updateNodeData"; id: string; patch: NodePatch })
  | (OpBase & { type: "connect"; source: string; target: string })
  | (OpBase & { type: "setSetting"; patch: Partial<Settings> });

// applyOp
export type ApplyResult =
    | {ok: true; doc: Doc}
    | {ok: false; reason: string};

