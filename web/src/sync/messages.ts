import { applyOp } from "@/model/applyOp";
import { emptyDoc } from "@/model/doc";
import type { Doc, Op } from "@/model/types";
import type { ServerMessage } from "./protocol";

export function docFromOps(ops: Op[]): Doc {
  return ops.reduce((doc, op) => {
    const r = applyOp(doc, op);
    /** the server now rejects bad ops before storing them, so this skip is a safety net (e.g. an op log
     *  written before Stage 6): every client runs the same applyOp over the same list, so they all skip the same ops */
    return r.ok ? r.doc : doc;
  }, emptyDoc());
}

export function parseServerMessage(text: string): ServerMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  if (m.type === "reject" && typeof m.clientSeq === "number" && typeof m.reason === "string") {
    return data as ServerMessage;
  }
  if (m.type === "claims" && isClaims(m.claims)) return data as ServerMessage;
  const hasIds = typeof m.version === "number" && typeof m.clientId === "string";
  // claims is optional on a snapshot (an older server doesn't send it), but if present it must be a map
  if (m.type === "snapshot" && hasIds && Array.isArray(m.ops) && (m.claims === undefined || isClaims(m.claims))) {
    return data as ServerMessage;
  }
  if (m.type === "op" && hasIds && typeof m.clientSeq === "number" && typeof m.op === "object" && m.op !== null) {
    return data as ServerMessage;
  }
  return null;
}

/** a plain object of string → string (nodeId → clientId) */
function isClaims(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    && Object.values(v).every((id) => typeof id === "string");
}
