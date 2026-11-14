import { applyOp } from "@/model/applyOp";
import { emptyDoc, OUTPUT_ID } from "@/model/doc";
import { starterOps } from "@/model/starter";
import type { Doc, Op } from "@/model/types";
import { SERVER_HTTP } from "./config";

/* ---------- Seeds: what a new room (or a loaded solo session) starts from ----------
   There's no database: rooms live in the server's memory. Users keep their own work by exporting it to a
   file, and any list of ops can seed a solo session or a new room (POST /api/rooms). */

/** what a new shared room starts from: my current graph, the demo, or just the Output */
export type SeedChoice = "mine" | "starter" | "blank";

/**
 * The current graph as the shortest op list that rebuilds it (NOT the history: ten minutes of tinkering is
 * hundreds of moves that no longer matter). Applied to emptyDoc() it gives back exactly this doc:
 * settings, then the Output's position, then every node, then every wire (nodes first, so wires find them).
 */
export function docToOps(doc: Doc): Op[] {
  let n = 0;
  const opId = () => `seed${++n}`;
  const ops: Op[] = [{ type: "setSetting", opId: opId(), patch: { bpm: doc.settings.bpm, eq: { ...doc.settings.eq } } }];
  const output = doc.nodes[OUTPUT_ID];
  if (output) ops.push({ type: "moveNodes", opId: opId(), positions: { [OUTPUT_ID]: { ...output.position } } });
  for (const node of Object.values(doc.nodes)) {
    if (node.id !== OUTPUT_ID) ops.push({ type: "addNode", opId: opId(), node: structuredClone(node) });
  }
  for (const e of Object.values(doc.edges)) ops.push({ type: "connect", opId: opId(), source: e.source, target: e.target });
  return ops;
}

export function seedOps(choice: SeedChoice, doc: Doc): Op[] {
  if (choice === "mine") return docToOps(doc);
  if (choice === "starter") return starterOps;
  return [];
}

/** all or nothing, like the server: the doc these ops build, or the first reason one of them was refused */
export function foldOps(ops: Op[]): { ok: true; doc: Doc } | { ok: false; reason: string } {
  let doc = emptyDoc();
  for (const [i, op] of ops.entries()) {
    const r = applyOp(doc, op);
    if (!r.ok) return { ok: false, reason: `op ${i + 1}: ${r.reason}` };
    doc = r.doc;
  }
  return { ok: true, doc };
}

/* ---------- Save files ---------- */

/** bump this if the file layout ever changes, so old files can be recognised and upgraded */
export const SAVE_FORMAT = 1;
export type SaveFile = { app: "music-canvas"; format: number; ops: Op[] };

export const saveFile = (doc: Doc): SaveFile => ({ app: "music-canvas", format: SAVE_FORMAT, ops: docToOps(doc) });

/** reads a save file's text: its ops if it's ours and the ops all apply, or why not (shown to the user) */
export function readSaveFile(text: string): { ok: true; ops: Op[]; doc: Doc } | { ok: false; reason: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not a Music Canvas file (not JSON)" };
  }
  const f = data as Partial<SaveFile> | null;
  if (typeof f !== "object" || f === null || f.app !== "music-canvas" || !Array.isArray(f.ops)) {
    return { ok: false, reason: "not a Music Canvas file" };
  }
  if (f.format !== SAVE_FORMAT) return { ok: false, reason: `unsupported file format ${String(f.format)}` };
  const r = foldOps(f.ops);
  return r.ok ? { ok: true, ops: f.ops, doc: r.doc } : { ok: false, reason: `file can't be loaded: ${r.reason}` };
}

/** browser download of the current graph */
export function downloadSaveFile(doc: Doc) {
  const blob = new Blob([JSON.stringify(saveFile(doc), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `music-canvas-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- Server ---------- */

/** asks the server for a new room seeded with these ops; resolves to its id, or throws with the server's reason */
export async function createRoom(ops: Op[], fetchFn: typeof fetch = fetch): Promise<string> {
  let res: Response;
  try {
    res = await fetchFn(`${SERVER_HTTP}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ops }),
    });
  } catch {
    throw new Error("can't reach the server");
  }
  const body = (await res.json().catch(() => null)) as { roomId?: unknown; detail?: unknown } | null;
  if (res.ok && typeof body?.roomId === "string") return body.roomId;
  throw new Error(typeof body?.detail === "string" ? body.detail : `server error ${res.status}`);
}
