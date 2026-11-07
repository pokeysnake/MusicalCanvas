import type { Doc, Op } from "@/model/types";
import { docFromOps, parseServerMessage } from "./messages";
import type { ClientOpMessage } from "./protocol";

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
  onSnapshot(doc: Doc): void;
  onOp(op: Op): void;
  onStatus(status: Status): void;
};

export type RoomSocket = { send(op: Op): void; close(): void };

const OPEN = 1;

export function connectRoom(
  url: string,
  handlers: Handlers,
  Ctor: SocketCtor = WebSocket as unknown as SocketCtor,
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
    if (msg.type === "snapshot") handlers.onSnapshot(docFromOps(msg.ops));
    else handlers.onOp(msg.op);
  };
  return {
    send(op) {
      if (ws.readyState !== OPEN) return;
      const msg: ClientOpMessage = { type: "op", op, clientSeq: ++seq };
      ws.send(JSON.stringify(msg));
    },
    close() {
      ws.onopen = ws.onmessage = ws.onclose = null;
      ws.close();
    },
  };
}