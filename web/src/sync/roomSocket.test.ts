import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc, Op } from "@/model/types";
import { starterDoc, starterOps } from "@/model/starter";
import type { Claims, RejectMessage, ServerOpMessage } from "./protocol";
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
let claimMaps: Claims[];
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
      onClaims: (c) => claimMaps.push(c),
    },
    FakeSocket,
  );

beforeEach(() => {
  docs = [];
  ops = [];
  rejects = [];
  ids = [];
  statuses = [];
  claimMaps = [];
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
describe("connectRoom: drag claims", () => {
  const sent = () => FakeSocket.last.sent.map((s) => JSON.parse(s));

  it("a snapshot hands over the room's claims (none = empty map)", () => {
    connect();
    FakeSocket.last.receive({ type: "snapshot", version: 0, clientId: "c1", ops: [], claims: { n1: "c2" } });
    FakeSocket.last.receive({ type: "snapshot", version: 0, clientId: "c1", ops: [] });
    expect(claimMaps).toEqual([{ n1: "c2" }, {}]);
  });

  it("a claims message goes to onClaims, not onOp", () => {
    connect();
    FakeSocket.last.receive({ type: "claims", claims: { n1: "c2" } });
    expect(claimMaps).toEqual([{ n1: "c2" }]);
    expect(ops).toEqual([]);
  });

  it("claim and release send their node ids", () => {
    const room = connect();
    FakeSocket.last.open();
    room.claim(["n1", "n2"]);
    room.release(["n1", "n2"]);
    expect(sent()).toEqual([
      { type: "claim", nodeIds: ["n1", "n2"] },
      { type: "release", nodeIds: ["n1", "n2"] },
    ]);
  });

  it("sends nothing for an empty list, or while the socket isn't open", () => {
    const room = connect();
    room.claim(["n1"]);
    FakeSocket.last.open();
    room.claim([]);
    room.release([]);
    expect(FakeSocket.last.sent).toEqual([]);
  });

  it("claims don't use up an op clientSeq", () => {
    const room = connect();
    FakeSocket.last.open();
    room.claim(["n1"]);
    expect(room.send(bpm(100))).toBe(1);
  });

  it("with lag, claim, move and release still leave in the order they were sent", () => {
    vi.useFakeTimers();
    const handlers = { onSnapshot() {}, onOp() {}, onReject() {}, onStatus() {} };
    const room = connectRoom("ws://x/ws/r1", handlers, FakeSocket, 3000);
    FakeSocket.last.open();
    room.claim(["n1"]);
    room.send(bpm(100));
    room.release(["n1"]);
    expect(FakeSocket.last.sent).toEqual([]);
    vi.advanceTimersByTime(3000);
    expect(sent().map((m) => m.type)).toEqual(["claim", "op", "release"]);
    vi.useRealTimers();
  });
});
