import type { ApplyResult, Doc, GraphEdge, NodeType, Op } from "./types";
import { edgeId } from "./types";
import { isValidPair, wouldCreateCycle } from "./graph";

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
    // moveNode
    /**
     *  { ...doc} copies the doc --> ...doc.nodes copes the node map, ...is what copies
     *  only the parts that change get copied, everything else is shared with the old doc --> we never modify the input
     */
    case "moveNode": {
      const node = doc.nodes[op.id];
      if (!node) return reject("node does not exist");
      return ok({
        ...doc,
        nodes: { ...doc.nodes, [op.id]: { ...node, position: op.position } },
      });
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
      return ok({ ...doc, nodes: { ...doc.nodes, [op.node.id]: op.node } });
    }

    // disconnect
    /**
     *  const { [key]: _, ...rest } = obj --> gives rest with that key removed and obj itself is unchanged
     */
    case "disconnect": {
      if (!doc.edges[op.edgeId]) return reject("edge does not exist");
      const { [op.edgeId]: _removed, ...edges } = doc.edges; // copy everything EXCEPT that key
      return ok({ ...doc, edges });
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

    // deleteNode
    /**
     *  used edges too because a cable pointing at a node that no longer exists is a "dangling reference" it would break the compiler and dimming code
     *  deleting a node must always clean up cables
     */
    case "deleteNode": {
      const node = doc.nodes[op.id];
      if (!node) return reject("node does not exist");
      if (node.type === "output")
        return reject("the Output node cannot be deleted");

      const { [op.id]: _removed, ...nodes } = doc.nodes;
      const edges = Object.fromEntries(
        Object.entries(doc.edges).filter(
          ([, e]) => e.source !== op.id && e.target !== op.id,
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
