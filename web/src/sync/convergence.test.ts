import { describe, expect, it } from "vitest";
import { applyOp } from "@/model/applyOp";
import { OUTPUT_ID } from "@/model/doc";
import { starterDoc, starterOps } from "@/model/starter";
import type { Doc, GraphNode, Op } from "@/model/types";
import { docFromOps } from "./messages";
import { initialSync, syncReducer, type SyncState } from "./optimistic";
import type { RejectMessage, ServerOpMessage } from "./protocol";

/* =====================================================================
   Randomized convergence (Stage 6 gate): many clients edit at once over a laggy network,
   and every one of them must end with exactly the server's doc.

   The model, kept honest to the real system:
   - each client has an outbox (its ops, in send order) and an inbox (server messages, in order):
     a websocket never reorders, but each one is delayed by a different, random amount
   - the fake server is the real rules: it runs applyOp on its doc (the TS twin of the Python
     apply_op), stores accepted ops, broadcasts them to everyone, and rejects to the sender only
   - clients use the real syncReducer and build ops from whatever their OWN screen shows,
     so they constantly act on stale views: that's where the races come from
   - a random step either makes a local edit, delivers one op to the server, or delivers one
     server message to one client. After the random phase, everything in flight is delivered.
   Seeded, so a failure prints a seed that replays the exact same run.
   ===================================================================== */

/** small seeded PRNG (mulberry32): same seed, same run */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T,>(xs: T[]): T | undefined => (xs.length ? xs[int(xs.length)] : undefined);
  return { next, int, pick };
}
type Rng = ReturnType<typeof rng>;

/* ---------- random ops, built from one client's (possibly stale) view ---------- */
const at = (r: Rng) => ({ x: r.int(1000), y: r.int(600) });

function newNode(r: Rng, id: string): GraphNode {
  switch (r.int(4)) {
    case 0: return { id, type: "notes", position: at(r), data: { name: id, text: "c4 e4" } };
    case 1: return { id, type: "instrument", position: at(r), data: { sound: "triangle", muted: false, solo: false } };
    case 2: return { id, type: "fx", position: at(r), data: { effects: [] } };
    // filters twice as likely: filter -> filter chains are where cycles can race
    default: return { id, type: "filter", position: at(r), data: { kind: "lpf", value: 800, q: 0.7 } };
  }
}

function randomOp(r: Rng, view: Doc, makeId: () => string): Op {
  const opId = makeId();
  const nodes = Object.values(view.nodes);
  const ids = nodes.map((n) => n.id);
  const chainable = nodes.filter((n) => n.type === "filter" || n.type === "fx").map((n) => n.id);
  const roll = r.next();

  if (roll < 0.18) return { type: "addNode", opId, node: newNode(r, makeId()) };

  if (roll < 0.45) {
    // mostly filter/fx pairs (valid both ways, so two people wiring "a->b" and "b->a" is a cycle race)
    const pool = chainable.length >= 2 && r.next() < 0.7 ? chainable : ids;
    return { type: "connect", opId, source: r.pick(pool)!, target: r.pick(pool)! };
  }

  if (roll < 0.58) {
    const positions: Record<string, { x: number; y: number }> = {};
    for (let i = 0, n = 1 + r.int(3); i < n; i++) positions[r.pick(ids)!] = at(r);
    if (r.next() < 0.1) positions.ghost = at(r); // a node that never existed
    return { type: "moveNodes", opId, positions };
  }

  if (roll < 0.68) {
    const edges = Object.keys(view.edges);
    return r.next() < 0.6 || edges.length === 0
      ? { type: "deleteElements", opId, nodeIds: [r.pick(ids)!], edgeIds: [] } // sometimes the Output: rejected
      : { type: "deleteElements", opId, nodeIds: [], edgeIds: [r.pick(edges)!] };
  }

  if (roll < 0.86) {
    const n = r.pick(nodes)!;
    switch (n.type) {
      case "notes": return { type: "updateNodeData", opId, id: n.id, patch: { name: `n${r.int(99)}` } };
      case "instrument": return { type: "updateNodeData", opId, id: n.id, patch: { muted: r.next() < 0.5 } };
      case "filter": return { type: "updateNodeData", opId, id: n.id, patch: { value: 20 + r.int(5000) } };
      case "fx": {
        const effects = Array.from({ length: r.int(3) }, (_, i) => ({ id: `e${i}`, kind: "room" as const, value: r.next(), on: true }));
        return { type: "updateNodeData", opId, id: n.id, patch: { effects } };
      }
      default: return { type: "updateNodeData", opId, id: n.id, patch: {} }; // Output: nothing editable
    }
  }

  // bpm, sometimes out of range (40-240) so the server rejects it
  return { type: "setSetting", opId, patch: { bpm: 20 + r.int(240) } };
}

/* ---------- one simulated room ---------- */
type Client = { id: string; s: SyncState; seq: number; outbox: { op: Op; clientSeq: number }[]; inbox: (ServerOpMessage | RejectMessage)[] };

type RunResult = { server: Doc; log: Op[]; clients: Client[]; rejects: string[] };

function runRoom(seed: number, nClients: number, steps: number): RunResult {
  const r = rng(seed);
  let server = starterDoc();
  const log: Op[] = [...starterOps];
  const rejects: string[] = [];
  let ids = 0;
  const makeId = () => `s${seed}-${ids++}`;

  const join = (id: string): Client => ({
    id, seq: 0, outbox: [], inbox: [],
    s: syncReducer(initialSync(starterDoc()), { type: "snapshot", doc: docFromOps(log), clientId: id }),
  });
  const clients = Array.from({ length: nClients }, (_, i) => join(`c${i}`));

  // the server handles the oldest op in one client's outbox (exactly what main.py's loop does)
  const serverReceives = (c: Client) => {
    const { op, clientSeq } = c.outbox.shift()!;
    // 3% of ops break a rule only the server has. If both sides run the same applyOp, the client's
    // screen has already dropped any op the server rejects, so the reject's rollback never shows;
    // it only matters when the server is stricter (the TS/Python rules drift, or later: drag claims)
    const res = r.next() < 0.03 ? { ok: false as const, reason: "server-only rule" } : applyOp(server, op);
    if (!res.ok) {
      rejects.push(res.reason);
      c.inbox.push({ type: "reject", clientSeq, reason: res.reason });
      return;
    }
    server = res.doc;
    log.push(op);
    const msg: ServerOpMessage = { type: "op", op, version: log.length, clientId: c.id, clientSeq };
    for (const other of clients) other.inbox.push(msg);
  };

  const clientReceives = (c: Client) => {
    const msg = c.inbox.shift()!;
    c.s = syncReducer(c.s, msg.type === "op"
      ? { type: "remote", msg }
      : { type: "reject", clientSeq: msg.clientSeq, reason: msg.reason });
  };

  for (let step = 0; step < steps; step++) {
    const c = r.pick(clients)!;
    const roll = r.next();
    if (roll < 0.4) {
      // a local edit, exactly as EditorApp's dispatch: send (get a seq), then apply as pending
      const op = randomOp(r, c.s.doc, makeId);
      const clientSeq = ++c.seq;
      c.outbox.push({ op, clientSeq });
      c.s = syncReducer(c.s, { type: "local", op, seq: clientSeq });
    } else if (roll < 0.7) {
      if (c.outbox.length) serverReceives(c);
    } else if (c.inbox.length) {
      clientReceives(c);
    }
    // now and then someone new joins mid-jam from the server's snapshot
    if (r.next() < 0.01 && clients.length < nClients + 2) clients.push(join(`late${clients.length}`));
  }

  // let the network settle: everything sent reaches the server, everything broadcast reaches everyone
  while (clients.some((c) => c.outbox.length || c.inbox.length)) {
    for (const c of clients) if (c.outbox.length) serverReceives(c);
    for (const c of clients) while (c.inbox.length) clientReceives(c);
  }
  return { server, log, clients, rejects };
}

/* ---------- the checks ---------- */
describe("randomized convergence", () => {
  it("1000 random rooms: every client ends with exactly the server's doc", () => {
    const reasons = new Map<string, number>();
    for (let seed = 1; seed <= 1000; seed++) {
      const nClients = 2 + (seed % 4); // 2-5 clients
      const { server, log, clients, rejects } = runRoom(seed, nClients, 150);
      for (const why of rejects) reasons.set(why, (reasons.get(why) ?? 0) + 1);

      // the op log replays to the live doc (what a late joiner or a restarted server would rebuild)
      expect(docFromOps(log), `seed ${seed}: log replay`).toEqual(server);
      for (const c of clients) {
        expect(c.s.pending, `seed ${seed}: ${c.id} has ops still pending`).toEqual([]);
        expect(c.s.confirmed, `seed ${seed}: ${c.id} confirmed`).toEqual(server);
        expect(c.s.doc, `seed ${seed}: ${c.id} screen`).toEqual(server);
      }
      // the Output is never lost, however the races went
      expect(server.nodes[OUTPUT_ID], `seed ${seed}: Output`).toBeDefined();
    }

    // the runs must actually have hit the hard cases, or passing proves nothing
    const count = (prefix: string) => [...reasons].filter(([k]) => k.startsWith(prefix)).reduce((n, [, v]) => n + v, 0);
    expect(count("would create a cycle")).toBeGreaterThan(100);
    expect(count("node does not exist")).toBeGreaterThan(100);
    expect(count("duplicate connection")).toBeGreaterThan(100);
    expect(count("bpm must be")).toBeGreaterThan(100);
    expect(count("server-only rule")).toBeGreaterThan(100);
  });

  it("is deterministic: the same seed replays the same run", () => {
    const a = runRoom(42, 4, 150);
    const b = runRoom(42, 4, 150);
    expect(a.log).toEqual(b.log);
    expect(a.server).toEqual(b.server);
  });
});
