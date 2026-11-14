import { describe, expect, it, vi } from "vitest";
import { compile } from "@/model/compile";
import { emptyDoc, OUTPUT_ID } from "@/model/doc";
import { starterDoc, starterOps } from "@/model/starter";
import type { Doc, Op } from "@/model/types";
import { initialSync, syncReducer } from "./optimistic";
import { createRoom, docToOps, foldOps, readSaveFile, SAVE_FORMAT, saveFile, seedOps } from "./seed";

/* Seeds and patch files: there's no database, so the graph has to survive being turned into ops and back.
   starter: n1 (notes) -> n2 (instrument) -> n3 (lpf) -> output */

const rebuilt = (doc: Doc) => {
  const r = foldOps(docToOps(doc));
  if (!r.ok) throw new Error(r.reason);
  return r.doc;
};

/** the starter after some tinkering: tempo, eq, a moved Output, an FX rack wired in */
function tinkered(): Doc {
  const ops: Op[] = [
    { type: "setSetting", opId: "a", patch: { bpm: 96, eq: { low: 2, mid: 0, high: -1 } } },
    { type: "moveNodes", opId: "b", positions: { [OUTPUT_ID]: { x: 1200, y: 40 }, n1: { x: -5, y: 7 } } },
    { type: "deleteElements", opId: "c", nodeIds: [], edgeIds: ["n3->output"] },
    {
      type: "addNode", opId: "d",
      node: { id: "fx1", type: "fx", position: { x: 900, y: 0 }, data: { effects: [{ id: "r", kind: "room", value: 0.4, on: false }] } },
    },
    { type: "connect", opId: "e", source: "n3", target: "fx1" },
    { type: "connect", opId: "f", source: "fx1", target: OUTPUT_ID },
  ];
  const r = foldOps([...starterOps, ...ops]);
  if (!r.ok) throw new Error(r.reason);
  return r.doc;
}

describe("docToOps", () => {
  it("rebuilds the starter exactly", () => {
    expect(rebuilt(starterDoc())).toEqual(starterDoc());
  });

  it("rebuilds a tinkered graph exactly: settings, the moved Output, nodes, wires", () => {
    const doc = tinkered();
    expect(rebuilt(doc)).toEqual(doc);
  });

  it("the rebuilt graph compiles to the same Strudel code (same sound)", () => {
    const doc = tinkered();
    expect(compile(rebuilt(doc)).code).toBe(compile(doc).code);
  });

  it("an empty graph is just the settings and the Output's position", () => {
    expect(docToOps(emptyDoc()).map((o) => o.type)).toEqual(["setSetting", "moveNodes"]);
    expect(rebuilt(emptyDoc())).toEqual(emptyDoc());
  });

  it("is the shape of the graph, not its history: one op per node and wire, however many edits came before", () => {
    const doc = tinkered();
    const nodes = Object.keys(doc.nodes).length - 1; // the Output already exists in emptyDoc()
    expect(docToOps(doc)).toHaveLength(2 + nodes + Object.keys(doc.edges).length);
  });

  it("copies nodes, so editing the ops can't change the doc", () => {
    const doc = tinkered();
    const add = docToOps(doc).find((o) => o.type === "addNode" && o.node.id === "fx1");
    if (add?.type !== "addNode" || add.node.type !== "fx") throw new Error("no fx1");
    add.node.data.effects[0].value = 99;
    expect(doc.nodes.fx1.type === "fx" && doc.nodes.fx1.data.effects[0].value).toBe(0.4);
  });
});

describe("seedOps", () => {
  it("mine = my graph, starter = the demo, blank = nothing", () => {
    const doc = tinkered();
    expect(seedOps("mine", doc)).toEqual(docToOps(doc));
    expect(seedOps("starter", doc)).toBe(starterOps);
    expect(seedOps("blank", doc)).toEqual([]);
  });
});

describe("foldOps", () => {
  it("is all or nothing, and says which op failed", () => {
    const bad: Op = { type: "connect", opId: "x", source: "nope", target: OUTPUT_ID };
    expect(foldOps([...starterOps, bad])).toEqual({ ok: false, reason: `op ${starterOps.length + 1}: node does not exist` });
  });
});

describe("patch files", () => {
  const text = (v: unknown) => JSON.stringify(v);

  it("a saved file loads back to the same graph", () => {
    const doc = tinkered();
    const r = readSaveFile(text(saveFile(doc)));
    expect(r.ok && r.doc).toEqual(doc);
  });

  it("says what's wrong with a file that isn't ours", () => {
    expect(readSaveFile("hello")).toEqual({ ok: false, reason: "not a Music Canvas file (not JSON)" });
    expect(readSaveFile(text({ ops: [] }))).toEqual({ ok: false, reason: "not a Music Canvas file" });
    expect(readSaveFile(text({ app: "music-canvas", format: SAVE_FORMAT }))).toEqual({ ok: false, reason: "not a Music Canvas file" });
    expect(readSaveFile("null")).toEqual({ ok: false, reason: "not a Music Canvas file" });
  });

  it("refuses a format it doesn't know", () => {
    expect(readSaveFile(text({ app: "music-canvas", format: 99, ops: [] }))).toEqual({ ok: false, reason: "unsupported file format 99" });
  });

  it("refuses a file whose ops don't apply (e.g. edited by hand)", () => {
    const bad = { app: "music-canvas", format: SAVE_FORMAT, ops: [{ type: "setSetting", opId: "x", patch: { bpm: 999 } }] };
    expect(readSaveFile(text(bad))).toEqual({ ok: false, reason: "file can't be loaded: op 1: bpm must be 40-240" });
  });
});

describe("createRoom", () => {
  const reply = (status: number, body: unknown) =>
    vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

  it("posts the ops and returns the new room id", async () => {
    const fetchFn = reply(201, { roomId: "abc" });
    await expect(createRoom(starterOps, fetchFn)).resolves.toBe("abc");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/rooms$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ ops: starterOps });
  });

  it("throws the server's reason when it refuses the seed", async () => {
    await expect(createRoom([], reply(422, { detail: "node does not exist" }))).rejects.toThrow("node does not exist");
  });

  it("throws a readable error when the server is down or answers garbage", async () => {
    const down = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    await expect(createRoom([], down)).rejects.toThrow("can't reach the server");
    await expect(createRoom([], reply(502, "<html>bad gateway</html>"))).rejects.toThrow("server error 502");
  });
});

describe("syncReducer: load (solo)", () => {
  it("replaces the doc, clears pending and errors, and sets the revision to the file's op count", () => {
    const doc = tinkered();
    const before = { ...initialSync(starterDoc()), error: "old error" };
    const s = syncReducer(before, { type: "load", doc, version: 12 });
    expect(s.doc).toBe(doc);
    expect(s.confirmed).toBe(doc);
    expect(s.pending).toEqual([]);
    expect(s.error).toBeNull();
    expect(s.version).toBe(12);
  });
});
