import { describe, expect, it } from "vitest";
import { applyOp } from "@/model/applyOp";
import { starterDoc } from "@/model/starter";
import type { Doc, Op } from "@/model/types";
import { initialSync, syncReducer, type SyncAction, type SyncState } from "./optimistic";
import { CLAIM_REJECT } from "./protocol";

/* starter: n1 (notes) -> n2 (instrument) -> n3 (lpf) -> output */
const bpm = (n: number): Op => ({ type: "setSetting", opId: `bpm${n}`, patch: { bpm: n } });
const move = (id: string, x: number): Op => ({ type: "moveNodes", opId: `m${x}`, positions: { [id]: { x, y: 0 } } });
const del = (id: string): Op => ({ type: "deleteElements", opId: `d${id}`, nodeIds: [id], edgeIds: [] });
const setValue = (id: string, value: number): Op => ({ type: "updateNodeData", opId: `v${value}`, id, patch: { value } });

const ME = "me";
const joined = (): SyncState => syncReducer(initialSync(starterDoc()), { type: "snapshot", doc: starterDoc(), clientId: ME });
const run = (s: SyncState, ...actions: SyncAction[]) => actions.reduce(syncReducer, s);

let version = 0;
const remote = (op: Op, clientId: string, clientSeq: number): SyncAction =>
  ({ type: "remote", msg: { type: "op", op, version: ++version, clientId, clientSeq } });
const local = (op: Op, seq: number): SyncAction => ({ type: "local", op, seq });

describe("syncReducer: solo", () => {
  it("a solo op goes straight into confirmed", () => {
    const s = run(initialSync(starterDoc()), { type: "local", op: bpm(100), seq: null });
    expect(s.doc.settings.bpm).toBe(100);
    expect(s.confirmed).toBe(s.doc);
    expect(s.pending).toEqual([]);
  });
});

describe("syncReducer: my own ops", () => {
  it("shows a local op instantly, before the server answers", () => {
    const s = run(joined(), local(bpm(100), 1));
    expect(s.doc.settings.bpm).toBe(100);
    expect(s.confirmed.settings.bpm).toBe(starterDoc().settings.bpm); // not confirmed yet
    expect(s.pending).toEqual([{ seq: 1, op: bpm(100) }]);
  });

  it("its echo confirms it without changing the screen (same doc object, no re-render)", () => {
    const before = run(joined(), local(bpm(100), 1));
    const after = run(before, remote(bpm(100), ME, 1));
    expect(after.pending).toEqual([]);
    expect(after.doc).toBe(before.doc);
    expect(after.confirmed).toEqual(after.doc);
  });

  it("a reject rolls it back and says why", () => {
    const s = run(joined(), local(bpm(100), 1), { type: "reject", clientSeq: 1, reason: "nope" });
    expect(s.doc).toEqual(starterDoc());
    expect(s.pending).toEqual([]);
    expect(s.error).toBe("nope");
  });

  it("a reject removes only that op; later pending ops stay on screen", () => {
    const s = run(joined(), local(move("n1", 10), 1), local(bpm(100), 2), { type: "reject", clientSeq: 1, reason: "x" });
    expect(s.doc.nodes.n1.position).toEqual(starterDoc().nodes.n1.position);
    expect(s.doc.settings.bpm).toBe(100);
    expect(s.pending.map((p) => p.seq)).toEqual([2]);
  });

  it("an op applyOp rejects here never becomes pending", () => {
    const s = run(joined(), local(bpm(999), 1));
    expect(s.pending).toEqual([]);
    expect(s.error).toContain("bpm");
  });
});

describe("syncReducer: other people's ops", () => {
  it("a remote op lands under my pending ops (rebase)", () => {
    const s = run(joined(), local(bpm(100), 1), remote(move("n1", 50), "them", 1));
    expect(s.doc.nodes.n1.position).toEqual({ x: 50, y: 0 }); // theirs
    expect(s.doc.settings.bpm).toBe(100);                     // still mine, still pending
    expect(s.confirmed.settings.bpm).toBe(starterDoc().settings.bpm);
  });

  it("their delete hides my pending edit at once; the reject then clears it", () => {
    let s = run(joined(), local(setValue("n3", 500), 1), remote(del("n3"), "them", 1));
    expect(s.doc.nodes.n3).toBeUndefined();
    expect(s.pending).toHaveLength(1); // still waiting for the server's verdict
    s = run(s, { type: "reject", clientSeq: 1, reason: "node does not exist" });
    expect(s.pending).toEqual([]);
    expect(s.doc).toEqual(s.confirmed);
  });

  it("same field, server order decides: theirs first, then my echo, so mine wins", () => {
    let s = run(joined(), local(bpm(100), 1), remote(bpm(120), "them", 1));
    expect(s.doc.settings.bpm).toBe(100); // my pending op sits on top of theirs
    s = run(s, remote(bpm(100), ME, 1));
    expect(s.confirmed.settings.bpm).toBe(100);
    expect(s.doc.settings.bpm).toBe(100);
  });

  it("same field, mine first: I see theirs once it arrives", () => {
    const s = run(joined(), local(bpm(100), 1), remote(bpm(100), ME, 1), remote(bpm(120), "them", 1));
    expect(s.doc.settings.bpm).toBe(120);
  });
});

describe("syncReducer: snapshot", () => {
  it("a new snapshot replaces everything and drops pending ops", () => {
    const s = run(joined(), local(bpm(100), 1), { type: "snapshot", doc: starterDoc(), clientId: "me2" });
    expect(s.pending).toEqual([]);
    expect(s.doc).toEqual(starterDoc());
    expect(s.clientId).toBe("me2");
  });
});

/* Two clients edit at once; a fake server applies their ops in one interleaved order, rejecting
   what no longer fits, and delivers every message in that order. Both screens must end equal to
   the server's doc. (The full randomized version is the last Stage 6 step.) */
describe("syncReducer: two clients converge", () => {
  it("ends with both screens equal to the server doc", () => {
    let server: Doc = starterDoc();
    const clients: Record<string, SyncState> = {
      a: syncReducer(initialSync(starterDoc()), { type: "snapshot", doc: starterDoc(), clientId: "a" }),
      b: syncReducer(initialSync(starterDoc()), { type: "snapshot", doc: starterDoc(), clientId: "b" }),
    };
    // each client fires its ops locally first, before hearing anything back
    const sent: Record<string, Op[]> = {
      a: [move("n1", 10), setValue("n3", 400), bpm(90)],
      b: [del("n3"), move("n1", 20), bpm(130)],
    };
    for (const [id, ops] of Object.entries(sent)) {
      ops.forEach((op, i) => (clients[id] = syncReducer(clients[id], local(op, i + 1))));
    }
    // the server receives them interleaved: b0 a0 a1 b1 a2 b2
    const order: [string, number][] = [["b", 0], ["a", 0], ["a", 1], ["b", 1], ["a", 2], ["b", 2]];
    for (const [from, i] of order) {
      const r = applyOp(server, sent[from][i]);
      if (!r.ok) {
        clients[from] = syncReducer(clients[from], { type: "reject", clientSeq: i + 1, reason: r.reason });
        continue;
      }
      server = r.doc;
      for (const id of Object.keys(clients)) clients[id] = syncReducer(clients[id], remote(sent[from][i], from, i + 1));
    }
    expect(clients.a.doc).toEqual(server);
    expect(clients.b.doc).toEqual(server);
    expect(clients.a.pending).toEqual([]);
    expect(clients.b.pending).toEqual([]);
    expect(server.nodes.n3).toBeUndefined();        // b's delete beat a's edit
    expect(server.nodes.n1.position.x).toBe(20);    // b's move came last
    expect(server.settings.bpm).toBe(130);
  });
});

describe("syncReducer: drag claim rejects (the snap-back tag)", () => {
  const reject = (clientSeq: number, reason = CLAIM_REJECT): SyncAction => ({ type: "reject", clientSeq, reason });

  it("my drop on a node someone else holds rolls back and records which nodes bounced", () => {
    const s = run(joined(), local(move("n1", 50), 1), reject(1));
    expect(s.doc.nodes.n1.position).toEqual(starterDoc().nodes.n1.position);
    expect(s.bounced).toEqual({ ids: ["n1"], n: 1 });
    expect(s.error).toBe(CLAIM_REJECT);
  });

  it("each bounce counts up, so the same node bouncing twice shows the tag again", () => {
    const s = run(joined(), local(move("n1", 50), 1), reject(1), local(move("n1", 60), 2), reject(2));
    expect(s.bounced).toEqual({ ids: ["n1"], n: 2 });
  });

  it("any other reject doesn't bounce", () => {
    const s = run(joined(), local(move("n1", 50), 1), reject(1, "node does not exist"));
    expect(s.bounced).toBeNull();
  });

  it("the claim reason on something that isn't a move doesn't bounce either", () => {
    const s = run(joined(), local(bpm(100), 1), reject(1));
    expect(s.bounced).toBeNull();
  });

  it("a rejoin keeps the last bounce, so its tag isn't re-shown or cut short", () => {
    const s = run(joined(), local(move("n1", 50), 1), reject(1));
    const again = syncReducer(s, { type: "snapshot", doc: starterDoc(), clientId: ME });
    expect(again.bounced).toBe(s.bounced);
  });
});
