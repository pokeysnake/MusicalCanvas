import { describe, expect, it } from "vitest";
import { emptyDoc, OUTPUT_ID } from "@/model/doc";
import { compile } from "@/model/compile";
import { edgeId, type Doc, type GraphNode } from "@/model/types";
import { issueText } from "./issues";

const at = { x: 0, y: 0 };

/** emptyDoc plus the given nodes, each wired straight to the next and the last to the Output */
function chain(...ns: GraphNode[]): Doc {
  const base = emptyDoc();
  const ids = [...ns.map((n) => n.id), OUTPUT_ID];
  const edges = Object.fromEntries(ids.slice(1).map((t, i) => {
    const id = edgeId(ids[i], t);
    return [id, { id, source: ids[i], target: t }];
  }));
  return { ...base, nodes: { ...base.nodes, ...Object.fromEntries(ns.map((n) => [n.id, n])) }, edges };
}

describe("issueText", () => {
  it("names a bad Notes node once, by its own name", () => {
    const doc = chain(
      { id: "n", type: "notes", position: at, data: { name: "Melody", text: "c4 [e4" } },
      { id: "i", type: "instrument", position: at, data: { sound: "saw", muted: false, solo: false } },
    );
    const [issue] = compile(doc).issues;
    const text = issueText(doc, issue);
    expect(text.startsWith("Melody: ")).toBe(true);
    expect(text.startsWith("Melody: Melody")).toBe(false); // the compiler no longer adds the name itself
  });

  it("names an instrument 'Instrument'", () => {
    const doc = chain(
      { id: "n", type: "notes", position: at, data: { name: "Melody", text: "c4" } },
      { id: "i", type: "instrument", position: at, data: { sound: "kazoo", muted: false, solo: false } },
    );
    expect(compile(doc).issues.map((x) => issueText(doc, x))).toEqual(["Instrument: unknown sound: kazoo"]);
  });

  it("names a filter by its label, or 'Filter' when the kind is unknown", () => {
    const doc = emptyDoc();
    const lpf: GraphNode = { id: "f", type: "filter", position: at, data: { kind: "lpf", value: 800, q: 0.7 } };
    expect(issueText({ ...doc, nodes: { ...doc.nodes, f: lpf } }, { nodeId: "f", message: "x" })).toBe("Low-pass: x");

    const odd = { ...lpf, data: { ...lpf.data, kind: "wobble" } } as unknown as GraphNode;
    expect(issueText({ ...doc, nodes: { ...doc.nodes, f: odd } }, { nodeId: "f", message: "x" })).toBe("Filter: x");
  });

  it("falls back to the bare message when the node is gone", () => {
    expect(issueText(emptyDoc(), { nodeId: "missing", message: "x" })).toBe("x");
  });
});
