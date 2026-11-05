import { describe, expect, it } from "vitest";
import { applyOp } from "./applyOp";
import { compile } from "./compile";
import { emptyDoc, OUTPUT_ID } from "./doc";
import { nodesReachingOutput } from "./graph";
import { starterDoc, starterOps } from "./starter";

/* the same file seeds every new server room, so it has to be a valid op log on its own */
describe("starter fixture", () => {
  it("every op applies in order to emptyDoc()", () => {
    let doc = emptyDoc();
    for (const op of starterOps) {
      const r = applyOp(doc, op);
      if (!r.ok) throw new Error(`${op.opId} rejected: ${r.reason}`);
      doc = r.doc;
    }
    expect(doc).toEqual(starterDoc());
  });

  it("has fixed, unique opIds (the server's op log stores them as-is)", () => {
    const ids = starterOps.map((op) => op.opId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^starter-\d+$/);
  });

  it("builds a valid graph: exactly one Output, and every node reaches it", () => {
    const doc = starterDoc();
    const nodes = Object.values(doc.nodes);
    expect(nodes.filter((n) => n.type === "output")).toHaveLength(1);
    expect(doc.nodes[OUTPUT_ID]).toBeDefined();
    // applyOp rejects cycles on connect, so all-ok + all-live means no cycles and nothing dangling
    expect(nodesReachingOutput(nodes, Object.values(doc.edges)).size).toBe(nodes.length);
  });

  it("compiles with no issues (it plays like the solo demo)", () => {
    expect(compile(starterDoc()).issues).toEqual([]);
  });
});
