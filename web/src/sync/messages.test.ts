import { describe, expect, it } from "vitest";
import { emptyDoc } from "@/model/doc";
import { starterDoc, starterOps } from "@/model/starter";
import type { Op } from "@/model/types";
import { docFromOps, parseServerMessage } from "./messages";

const bpm = (n: number, i: number): Op => ({ type: "setSetting", opId: `t${i}`, patch: { bpm: n } });

describe("docFromOps", () => {
  it("no ops is the empty doc", () => {
    expect(docFromOps([])).toEqual(emptyDoc());
  });

  it("the starter ops build the starter doc", () => {
    expect(docFromOps(starterOps)).toEqual(starterDoc());
  });

  it("skips a rejected op and keeps applying the rest", () => {
    const bad: Op = { type: "connect", opId: "bad", source: "nope", target: "output" };
    expect(docFromOps([bpm(100, 1), bad, bpm(110, 2)]).settings.bpm).toBe(110);
  });
});

describe("parseServerMessage", () => {
  const snapshot = { type: "snapshot", version: 0, clientId: "c1", ops: [] };
  const op = { type: "op", op: bpm(100, 1), version: 1, clientId: "c1", clientSeq: 1 };

  it("accepts a snapshot", () => {
    expect(parseServerMessage(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("accepts an op", () => {
    expect(parseServerMessage(JSON.stringify(op))).toEqual(op);
  });

  it("accepts a reject", () => {
    const reject = { type: "reject", clientSeq: 2, reason: "duplicate connection" };
    expect(parseServerMessage(JSON.stringify(reject))).toEqual(reject);
  });

  it("returns null for a reject without a reason", () => {
    expect(parseServerMessage(JSON.stringify({ type: "reject", clientSeq: 2 }))).toBeNull();
  });

  it("returns null for text that isn't JSON", () => {
    expect(parseServerMessage("hello")).toBeNull();
  });

  it("returns null for an unknown type", () => {
    expect(parseServerMessage(JSON.stringify({ type: "chat" }))).toBeNull();
  });

  it("returns null when a field is missing or the wrong type", () => {
    expect(parseServerMessage(JSON.stringify({ ...snapshot, version: "0" }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "op", op: bpm(100, 1) }))).toBeNull();
  });
});