import type { ApplyResult, Doc, GraphEdge, NodeType, Op, Position } from "./types";
import { edgeId } from "./types";
import { isValidPair, wouldCreateCycle } from "./graph";
import { isSoundId } from "./sounds";
import { FILTERS } from "./filters";

// small helpers so every case reads cleanly
const ok = (doc: Doc): ApplyResult => ({ ok: true, doc });
const reject = (reason: string): ApplyResult => ({ ok: false, reason });

/* ---------- number checks ----------
   ops arrive as JSON from other clients (Stage 5), and NaN or "120" slip past < and > checks,
   so every number field must be a real, finite number before anything else looks at it */
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const badPosition = (p: Position | undefined) => !p || !isNum(p.x) || !isNum(p.y);

/** node data fields that hold numbers (only filters have any today) */
const NUMBER_FIELDS = ["value", "q"];
const badNumberField = (data: object) =>
  NUMBER_FIELDS.find((k) => k in data && !isNum((data as Record<string, unknown>)[k]));

/** node data fields that must be strings / booleans (mirrors bad_field_type in apply_op.py) */
const STRING_FIELDS = ["name", "text"];
const BOOL_FIELDS = ["muted", "solo"];
function badFieldType(data: object): string | null {
  const d = data as Record<string, unknown>;
  for (const k of STRING_FIELDS) if (k in d && typeof d[k] !== "string") return `${k} must be a string`;
  for (const k of BOOL_FIELDS) if (k in d && typeof d[k] !== "boolean") return `${k} must be true or false`;
  if ("kind" in d && !(typeof d.kind === "string" && Object.hasOwn(FILTERS, d.kind)))
    return `unknown filter: ${String(d.kind)}`;
  return null;
}

/** which data fields each node type is allowed to change */
const EDITABLE_FIELDS: Record<NodeType, string[]> = {
  notes: ["name", "text"],
  instrument: ["sound", "muted", "solo"],
  filter: ["kind", "value", "q"],
  fx: ["effects"],
  output: [],
};

/**
 * An FX rack's `effects` list arrives as JSON, so check every row's shape (null = fine, else why not).
 * Each row: a non-empty string id (unique in the rack), a known effect kind, a finite value,
 * an optional finite q, and on = true/false. Values aren't range-checked here, same as Filter nodes.
 */
export function badEffects(effects: unknown): string | null {
  if (!Array.isArray(effects)) return "effects must be a list";
  const ids = new Set<string>();
  for (const e of effects) {
    if (typeof e !== "object" || e === null) return "each effect must be an object";
    const { id, kind, value, q, on } = e as Record<string, unknown>;
    if (typeof id !== "string" || id === "") return "each effect needs an id";
    if (ids.has(id)) return `duplicate effect id: ${id}`;
    ids.add(id);
    if (typeof kind !== "string" || !Object.hasOwn(FILTERS, kind)) return `unknown effect: ${String(kind)}`;
    if (!isNum(value)) return "effect value must be a finite number";
    if (q !== undefined && !isNum(q)) return "effect q must be a finite number";
    if (typeof on !== "boolean") return "effect on must be true or false";
  }
  return null;
}

export function applyOp(doc: Doc, op: Op): ApplyResult {
  switch (op.type) {
    // moveNodes
    /**
     *  { ...doc} copies the doc --> ...doc.nodes copes the node map, ...is what copies
     *  only the parts that change get copied, everything else is shared with the old doc --> we never modify the input
     *  missing ids are SKIPPED, like deleteElements: if someone deleted one node mid-drag,
     *  the rest of the drag still lands. Rejected only if NONE of the ids still exist.
     */
    case "moveNodes": {
      const ids = Object.keys(op.positions);
      if (ids.length === 0) return reject("no nodes to move");
      if (ids.some((id) => badPosition(op.positions[id]))) return reject("position must be finite numbers");
      const live = ids.filter((id) => doc.nodes[id]);
      if (live.length === 0) return reject("node does not exist");
      const nodes = { ...doc.nodes };
      for (const id of live) nodes[id] = { ...nodes[id], position: op.positions[id] };
      return ok({ ...doc, nodes });
    }

    // addNode
    /**
     *  if exists return reject
     *  if the node type is output --> we already have one so return reject
     * else return okay --> copy the doc, nodes becomes the nodemap copy, ops node id set to op.node
     */
    case "addNode": {
      if (doc.nodes[op.node.id]) return reject("node id already exists");
      if (op.node.type === "output")
        return reject("a room has exactly one Output");
      if (op.node.type === "instrument" && !isSoundId(op.node.data.sound))
        return reject(`unknown sound: ${op.node.data.sound}`);
      if (badPosition(op.node.position)) return reject("position must be finite numbers");
      if (op.node.type === "fx") {
        const why = badEffects(op.node.data.effects);
        if (why) return reject(why);
      }
      const badField = badNumberField(op.node.data);
      if (badField) return reject(`${badField} must be a finite number`);
      const badType = badFieldType(op.node.data);
      if (badType) return reject(badType);
      return ok({ ...doc, nodes: { ...doc.nodes, [op.node.id]: op.node } });
    }

    //connect
    /**
     *  cheap one look up checks run first, full graph search runs last, only when everything else passed
     */
    case "connect": {
      const src = doc.nodes[op.source];
      const tgt = doc.nodes[op.target];
      if (!src || !tgt) return reject("node does not exist");
      if (!isValidPair(src.type, tgt.type))
        return reject(`${src.type} cannot connect to ${tgt.type}`);

      const id = edgeId(op.source, op.target);
      if (doc.edges[id]) return reject("duplicate connection");

      if (wouldCreateCycle(Object.values(doc.edges), op.source, op.target)) {
        return reject("would create a cycle");
      }

      const edge: GraphEdge = { id, source: op.source, target: op.target };
      return ok({ ...doc, edges: { ...doc.edges, [id]: edge } });
    }

    // deleteElements (replaces deleteNode + disconnect)
    /**
     *  one delete action (a box-select + Delete) = one op
     *  - ids that are already gone are SKIPPED, not rejected: if another user deleted it first,
     *    this delete still did what was meant (delete beats edits)
     *  - edges touching a deleted node go too, otherwise they'd be "dangling references" that break the compiler and dimming code
     *  - including the Output rejects the whole op
     */
    case "deleteElements": {
      if (op.nodeIds.length === 0 && op.edgeIds.length === 0)
        return reject("nothing to delete");
      if (op.nodeIds.some((id) => doc.nodes[id]?.type === "output"))
        return reject("the Output node cannot be deleted");

      const goneNodes = new Set(op.nodeIds);
      const goneEdges = new Set(op.edgeIds);
      const nodes = Object.fromEntries(
        Object.entries(doc.nodes).filter(([id]) => !goneNodes.has(id)),
      );
      const edges = Object.fromEntries(
        Object.entries(doc.edges).filter(
          ([id, e]) => !goneEdges.has(id) && !goneNodes.has(e.source) && !goneNodes.has(e.target),
        ),
      );
      return ok({ ...doc, nodes, edges });
    }

    // updateNodeData
    /**
     *  catches what the type system cant
     *  - {sound: "square"} sent to a filter
     *  - as typeof node is needed bc typescript cant prove the merged object still matches that node's type
     */
    case "updateNodeData": {
      const node = doc.nodes[op.id];
      if (!node) return reject("node does not exist");

      const allowed = EDITABLE_FIELDS[node.type];
      const bad = Object.keys(op.patch).filter((k) => !allowed.includes(k));
      if (bad.length > 0)
        return reject(`${node.type} has no field(s): ${bad.join(", ")}`);
      if (op.patch.sound !== undefined && !isSoundId(op.patch.sound))
        return reject(`unknown sound: ${op.patch.sound}`);
      if (op.patch.effects !== undefined) {
        const why = badEffects(op.patch.effects);
        if (why) return reject(why);
      }
      const badField = badNumberField(op.patch);
      if (badField) return reject(`${badField} must be a finite number`);
      const badType = badFieldType(op.patch);
      if (badType) return reject(badType);

      const updated = {
        ...node,
        data: { ...node.data, ...op.patch },
      } as typeof node;
      return ok({ ...doc, nodes: { ...doc.nodes, [op.id]: updated } });
    }

    //setSetting
    /** merged the EQ separately because with a plain {...settings, ...patch } a patch of {eq: {low: 3}} would replace the whole EQ object and lose mid and high
     *  merging one level deeper keeps them
     */
    case "setSetting": {
      const { bpm, eq } = op.patch;
      // typeof + isFinite first: NaN and "120" both pass < and >, and ops will arrive as JSON from other clients
      if (bpm !== undefined && (!isNum(bpm) || bpm < 40 || bpm > 240))
        return reject("bpm must be 40-240");
      if (eq && Object.values(eq).some((v) => !isNum(v)))
        return reject("eq values must be finite numbers");
      return ok({
        ...doc,
        settings: {
          ...doc.settings,
          ...(bpm !== undefined ? { bpm } : {}),
          eq: { ...doc.settings.eq, ...eq },
        },
      });
    }
    default: {
      const unreachable: never = op; // compile error here if a case is missing
      return reject(`unknown op ${(unreachable as Op).type}`);
    }
  }
}
