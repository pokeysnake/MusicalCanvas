import type { Doc, Op } from "@/model/types";
import { docFromOps, parseServerMessage } from "./messages";
import type { ClientOpMessage, RejectMessage, ServerOpMessage } from "./protocol";

export type Status = "connecting" | "open" | "closed";

export type SocketLike = {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
};
export type SocketCtor = new (url: string) => SocketLike;

export type Handlers = {
  /** the room's doc, the id the server gave this connection (to spot our own echoes), and the op-log version */
  onSnapshot(doc: Doc, clientId: string, version: number): void;
  /** the whole message: the optimistic layer needs the sender's clientId and clientSeq */
  onOp(msg: ServerOpMessage): void;
  onReject(msg: RejectMessage): void;
  onStatus(status: Status): void;
};

/** send() returns the clientSeq the op went out with, or null if the socket wasn't open (op dropped) */
export type RoomSocket = { send(op: Op): number | null; close(): void };

const OPEN = 1;

/** lagMs (dev testing only): hold every outgoing op this long before it leaves, so one person can
 *  create races between two tabs. The op still shows instantly; only the server hears it late. */
export function connectRoom(
  url: string,
  handlers: Handlers,
  Ctor: SocketCtor = WebSocket as unknown as SocketCtor,
  lagMs = 0,
): RoomSocket {
  const ws = new Ctor(url);
  let seq = 0;
  handlers.onStatus("connecting");
  ws.onopen = () => handlers.onStatus("open");
  ws.onclose = () => handlers.onStatus("closed");
  ws.onmessage = (e) => {
    if (typeof e.data !== "string") return;
    const msg = parseServerMessage(e.data);
    if (!msg) return;
    if (msg.type === "snapshot") handlers.onSnapshot(docFromOps(msg.ops), msg.clientId, msg.version);
    else if (msg.type === "reject") handlers.onReject(msg);
    else handlers.onOp(msg);
  };
  return {
    send(op) {
      if (ws.readyState !== OPEN) return null;
      const msg: ClientOpMessage = { type: "op", op, clientSeq: ++seq };
      const text = JSON.stringify(msg);
      if (lagMs > 0) setTimeout(() => ws.readyState === OPEN && ws.send(text), lagMs);
      else ws.send(text);
      return msg.clientSeq;
    },
    close() {
      ws.onopen = ws.onmessage = ws.onclose = null;
      ws.close();
    },
  };
}
