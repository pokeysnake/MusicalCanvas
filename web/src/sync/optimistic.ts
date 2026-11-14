import { applyOp } from "@/model/applyOp";
import type { Doc, Op } from "@/model/types";
import { CLAIM_REJECT, type ServerOpMessage } from "./protocol";

/* ---------- Optimistic edits (Stage 6) ----------
   confirmed = the doc built ONLY from ops the server accepted, in server order (every client agrees on it)
   pending   = my ops that are sent but not echoed yet, oldest first
   doc       = what's on screen: confirmed with pending replayed on top

   A local op shows up instantly (applied to doc, added to pending). Then one of:
   - its echo arrives   --> it moves from pending into confirmed; the screen doesn't change
   - a reject arrives   --> it's dropped from pending and doc is rebuilt without it (the rollback)
   - someone else's op  --> it goes into confirmed and pending is replayed on top (the rebase);
                            a pending op that no longer fits (e.g. its node was just deleted) is
                            skipped on screen, and the server will reject it shortly */

export type Pending = { seq: number; op: Op };

export type SyncState = {
  confirmed: Doc;
  pending: Pending[];
  doc: Doc;
  /** why the last local op was rejected (by applyOp here, or by the server); null after a success */
  error: string | null;
  /** this connection's id from the snapshot, to recognise our own echoes; null in solo / before joining */
  clientId: string | null;
  /** how many ops `confirmed` is built from (the server's op-log version in a room; counted locally in solo).
   *  Display only: shown as the drawing's revision in the title block. */
  version: number;
  /** the nodes my last drop tried to move while someone else held them: they just snapped back, so the
   *  editor tags them for a moment. n counts up per bounce, so the same nodes bouncing twice still re-shows the tag. */
  bounced: { ids: string[]; n: number } | null;
};

export type SyncAction =
  /** join or rejoin: the server's doc replaces everything. Pending ops from an older connection are
   *  dropped; any the server did store are already inside this snapshot. */
  | { type: "snapshot"; doc: Doc; clientId: string; version?: number }
  /** a local edit. seq = the clientSeq it was sent with, or null in solo mode (applies straight to confirmed) */
  | { type: "local"; op: Op; seq: number | null }
  /** a broadcast op from the server: anyone's, our own echo included */
  | { type: "remote"; msg: ServerOpMessage }
  /** the server rejected our op with this clientSeq */
  | { type: "reject"; clientSeq: number; reason: string }
  /** solo only: a loaded save file replaces the whole doc. version = how many ops built it */
  | { type: "load"; doc: Doc; version: number };

export const initialSync = (doc: Doc): SyncState => ({
  confirmed: doc,
  pending: [],
  doc,
  error: null,
  clientId: null,
  version: 0,
  bounced: null,
});

/** confirmed + pending, skipping any pending op that no longer applies */
export function rebase(confirmed: Doc, pending: Pending[]): Doc {
  return pending.reduce((doc, p) => {
    const r = applyOp(doc, p.op);
    return r.ok ? r.doc : doc;
  }, confirmed);
}

/** Pure, like the model reducer: StrictMode running it twice is harmless. */
export function syncReducer(s: SyncState, a: SyncAction): SyncState {
  switch (a.type) {
    case "snapshot":
      return { ...s, confirmed: a.doc, pending: [], doc: a.doc, error: null, clientId: a.clientId, version: a.version ?? 0 };

    case "local": {
      const r = applyOp(s.doc, a.op);
      // invalid here already: show why and keep the doc. In a room it was sent anyway, and the
      // server's reject finds nothing pending under that seq, so it just repeats the error.
      if (!r.ok) return { ...s, error: r.reason };
      if (a.seq === null) return { ...s, confirmed: r.doc, doc: r.doc, error: null, version: s.version + 1 };
      return { ...s, pending: [...s.pending, { seq: a.seq, op: a.op }], doc: r.doc, error: null };
    }

    case "remote": {
      const r = applyOp(s.confirmed, a.msg.op);
      // the server already accepted it against the same doc, so this only fails if the two applyOps drift
      const confirmed = r.ok ? r.doc : s.confirmed;
      const mine = s.clientId !== null && a.msg.clientId === s.clientId;
      const version = a.msg.version;

      // the common case: the echo of my OLDEST pending op. The server applied it to exactly the doc
      // we had confirmed (the socket delivers in order), so the screen already shows the result;
      // keeping the same doc object means React doesn't re-render anything.
      if (mine && r.ok && s.pending[0]?.seq === a.msg.clientSeq) {
        return { ...s, confirmed, pending: s.pending.slice(1), version };
      }
      // someone else's op (or an echo we have no pending entry for, e.g. sent before the snapshot):
      // put it under our pending ops and replay them on top
      const pending = mine ? s.pending.filter((p) => p.seq !== a.msg.clientSeq) : s.pending;
      return { ...s, confirmed, pending, doc: rebase(confirmed, pending), version };
    }

    case "load":
      return { ...s, confirmed: a.doc, pending: [], doc: a.doc, error: null, version: a.version };

    case "reject": {
      const pending = s.pending.filter((p) => p.seq !== a.clientSeq);
      const next = { ...s, pending, doc: rebase(s.confirmed, pending), error: a.reason };
      // a drop that lost the race for a node: remember which nodes snapped back
      const lost = s.pending.find((p) => p.seq === a.clientSeq)?.op;
      if (a.reason !== CLAIM_REJECT || lost?.type !== "moveNodes") return next;
      return { ...next, bounced: { ids: Object.keys(lost.positions), n: (s.bounced?.n ?? 0) + 1 } };
    }
  }
}
