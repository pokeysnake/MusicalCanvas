import type { ApplyResult, Doc, GraphEdge, NodeType, Op } from "./types";
import { edgeId } from "./types";
import { isValidPair, wouldCreateCycle } from "./graph";
import { isSoundId } from "./sounds";

// small helpers so every case reads cleanly
const ok = (doc: Doc): ApplyResult => ({ ok: true, doc });
const reject = (reason: string): ApplyResult => ({ ok: false, reason });

/** which data fields each node type is allowed to change */
const EDITABLE_FIELDS: Record<NodeType, string[]> = {
  notes: ["name", "text"],
  instrument: ["sound", "muted", "solo"],
  filter: ["kind", "value", "q"],
  output: [],
};

export function applyOp(doc: Doc, op: Op): ApplyResult {
  switch (op.type) {
    // moveNodes
    /**
     *  { ...doc} copies the doc --> ...doc.nodes copes the node map, ...is what copies
     *  only the parts that change get copied, everything else is shared with the old doc --> we never modify the input
     *  all-or-nothing: if any id is missing, nothing moves (a multi-node drag is one action)
     *  STAGE 6 CONFLICT LIST: if one dragged node is deleted remotely mid-drag, this throws away the whole move.
     *  Probably should skip missing ids like deleteElements does, decide when the server mirrors this.
     */
    case "moveNodes": {
      const ids = Object.keys(op.positions);
      if (ids.length === 0) return reject("no nodes to move");
      if (ids.some((id) => !doc.nodes[id])) return reject("node does not exist");
      const nodes = { ...doc.nodes };
      for (const id of ids) nodes[id] = { ...nodes[id], position: op.positions[id] };
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
      if (bpm !== undefined && (bpm < 40 || bpm > 240))
        return reject("bpm must be 40-240");
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
