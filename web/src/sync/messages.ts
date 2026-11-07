import { applyOp } from "@/model/applyOp";
import { emptyDoc } from "@/model/doc";
import type { Doc, Op } from "@/model/types";
import type { ServerMessage } from "./protocol";

export function docFromOps(ops: Op[]): Doc {
  return ops.reduce((doc, op) => {
    const r = applyOp(doc, op);
    /** a rejected op is skipped the server only checks the envelope right now, every client runs the same applyOp over the same list in the same order so they all skip the same ops and have identical docs */
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
  const hasIds = typeof m.version === "number" && typeof m.clientId === "string";
  if (m.type === "snapshot" && hasIds && Array.isArray(m.ops)) return data as ServerMessage;
  if (m.type === "op" && hasIds && typeof m.clientSeq === "number" && typeof m.op === "object" && m.op !== null) {
    return data as ServerMessage;
  }
  return null;
}