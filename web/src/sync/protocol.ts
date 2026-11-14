import type { Op } from "@/model/types";

/* ---------- Wire protocol (JSON text frames over /ws/{roomId}) ----------
   Types only. The server mirrors these as Pydantic models, and checks every op with apply_op:
   a bad one is answered with a RejectMessage to the sender and never stored. */

/** client → server: one local op. clientSeq counts up per connection (1, 2, 3...) so the sender
 *  can match the echo to the op it sent; naive sync only needs the clientId, Stage 6 uses the seq */
export type ClientOpMessage = { type: "op"; op: Op; clientSeq: number };

/** client → server: I started dragging these nodes. The server only gives me the ones nobody holds
 *  (first to start wins) and broadcasts the new map if anything changed. Never stored in the op log. */
export type ClaimMessage = { type: "claim"; nodeIds: string[] };

/** client → server: I dropped these nodes (sent right after the drop's moveNodes op, so the move lands first) */
export type ReleaseMessage = { type: "release"; nodeIds: string[] };

export type ClientMessage = ClientOpMessage | ClaimMessage | ReleaseMessage;

/** nodeId → clientId of whoever is dragging it right now */
export type Claims = Record<string, string>;

/** server → client, once on connect: the room's whole op log. The client rebuilds the doc by applying
 *  ops to emptyDoc(). version = ops.length. clientId is the id the server gave THIS connection. */
export type SnapshotMessage = { type: "snapshot"; version: number; clientId: string; ops: Op[]; claims?: Claims };

/** server → every client in the room (sender included), once per accepted op.
 *  clientId and clientSeq are the SENDER's, so a client can recognise and skip its own echo. */
export type ServerOpMessage = { type: "op"; op: Op; version: number; clientId: string; clientSeq: number };

/** server → the sender only: its op failed the server's apply_op and was not stored */
export type RejectMessage = { type: "reject"; clientSeq: number; reason: string };

/** the reason the server gives when a move touches a node someone else is dragging */
export const CLAIM_REJECT = "node is being moved by someone else";

/** server → everyone in the room: the whole claims map, sent each time it changes */
export type ClaimsMessage = { type: "claims"; claims: Claims };

export type ServerMessage = SnapshotMessage | ServerOpMessage | RejectMessage | ClaimsMessage;
