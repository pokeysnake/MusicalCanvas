import { beforeEach, describe, expect, it } from "vitest";
import type { Doc, Op } from "@/model/types";
import { starterDoc, starterOps } from "@/model/starter";
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
let ops: Op[];
let statuses: Status[];
const connect = () =>
  connectRoom(
    "ws://x/ws/r1",
    {
      onSnapshot: (d) => docs.push(d),
      onOp: (o) => ops.push(o),
      onStatus: (s) => statuses.push(s),
    },
    FakeSocket,
  );

beforeEach(() => {
  docs = [];
  ops = [];
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
  });

  it("passes a broadcast op to onOp", () => {
    connect();
    FakeSocket.last.receive({ type: "op", op: bpm(100), version: 1, clientId: "c2", clientSeq: 1 });
    expect(ops).toEqual([bpm(100)]);
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
    room.send(bpm(100));
    expect(FakeSocket.last.sent).toEqual([]);
  });

  it("sends {type, op, clientSeq} counting up from 1", () => {
    const room = connect();
    FakeSocket.last.open();
    room.send(bpm(100));
    room.send(bpm(110));
    expect(FakeSocket.last.sent.map((s) => JSON.parse(s))).toEqual([
      { type: "op", op: bpm(100), clientSeq: 1 },
      { type: "op", op: bpm(110), clientSeq: 2 },
    ]);
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