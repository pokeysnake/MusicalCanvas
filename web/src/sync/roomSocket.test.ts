import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc, Op } from "@/model/types";
import { starterDoc, starterOps } from "@/model/starter";
import type { RejectMessage, ServerOpMessage } from "./protocol";
import { connectRoom, type SocketLike, type Status } from "./roomSocket";

class FakeSocket implements SocketLike {
  static last: FakeSocket;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  closed = false;
  constructor(public url: string) {
    FakeSocket.last = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: typeof msg === "string" ? msg : JSON.stringify(msg) });
  }
}

const bpm = (n: number): Op => ({ type: "setSetting", opId: `t${n}`, patch: { bpm: n } });

let docs: Doc[];
let ops: ServerOpMessage[];
let rejects: RejectMessage[];
let ids: string[];
let statuses: Status[];
const connect = () =>
  connectRoom(
    "ws://x/ws/r1",
    {
      onSnapshot: (d, id) => {
        docs.push(d);
        ids.push(id);
      },
      onOp: (m) => ops.push(m),
      onReject: (m) => rejects.push(m),
      onStatus: (s) => statuses.push(s),
    },
    FakeSocket,
  );

beforeEach(() => {
  docs = [];
  ops = [];
  rejects = [];
  ids = [];
  statuses = [];
});

describe("connectRoom", () => {
  it("connects to the url and reports connecting, then open", () => {
    connect();
    FakeSocket.last.open();
    expect(FakeSocket.last.url).toBe("ws://x/ws/r1");
    expect(statuses).toEqual(["connecting", "open"]);
  });

  it("turns a snapshot into a doc", () => {
    connect();
    FakeSocket.last.receive({ type: "snapshot", version: starterOps.length, clientId: "c1", ops: starterOps });
    expect(docs).toEqual([starterDoc()]);
    expect(ids).toEqual(["c1"]);
  });

  it("passes a broadcast op to onOp, with the sender's clientId and clientSeq", () => {
    connect();
    const msg = { type: "op", op: bpm(100), version: 1, clientId: "c2", clientSeq: 1 };
    FakeSocket.last.receive(msg);
    expect(ops).toEqual([msg]);
  });

  it("passes a reject to onReject", () => {
    connect();
    const msg = { type: "reject", clientSeq: 3, reason: "bpm must be 40-240" };
    FakeSocket.last.receive(msg);
    expect(rejects).toEqual([msg]);
    expect(ops).toEqual([]);
  });

  it("ignores garbage", () => {
    connect();
    FakeSocket.last.receive("hello");
    FakeSocket.last.receive({ type: "chat" });
    expect(docs).toEqual([]);
    expect(ops).toEqual([]);
  });

  it("drops a send while the socket isn't open", () => {
    const room = connect();
    expect(room.send(bpm(100))).toBeNull();
    expect(FakeSocket.last.sent).toEqual([]);
  });

  it("sends {type, op, clientSeq} counting up from 1", () => {
    const room = connect();
    FakeSocket.last.open();
    expect(room.send(bpm(100))).toBe(1);
    expect(room.send(bpm(110))).toBe(2);
    expect(FakeSocket.last.sent.map((s) => JSON.parse(s))).toEqual([
      { type: "op", op: bpm(100), clientSeq: 1 },
      { type: "op", op: bpm(110), clientSeq: 2 },
    ]);
  });

  it("with lag, the seq comes back at once but the op leaves only after the delay", () => {
    vi.useFakeTimers();
    const handlers = { onSnapshot() {}, onOp() {}, onReject() {}, onStatus() {} };
    const room = connectRoom("ws://x/ws/r1", handlers, FakeSocket, 3000);
    FakeSocket.last.open();
    expect(room.send(bpm(100))).toBe(1);
    expect(FakeSocket.last.sent).toEqual([]);
    vi.advanceTimersByTime(3000);
    expect(FakeSocket.last.sent).toHaveLength(1);
    vi.useRealTimers();
  });

  it("reports closed when the server drops", () => {
    connect();
    FakeSocket.last.open();
    FakeSocket.last.onclose?.();
    expect(statuses).toEqual(["connecting", "open", "closed"]);
  });

  it("close() closes the socket and silences its handlers", () => {
    const room = connect();
    const ws = FakeSocket.last;
    room.close();
    expect(ws.closed).toBe(true);
    expect(ws.onmessage).toBeNull();
    expect(ws.onclose).toBeNull();
  });
});