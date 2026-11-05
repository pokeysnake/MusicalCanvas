import starterJson from "@shared/fixtures/starter.json";
import { applyOp } from "./applyOp";
import { emptyDoc } from "./doc";
import type { Doc, Op } from "./types";

/** the demo graph as an op log. One file, two users: the server seeds every new room with it,
 *  and solo mode (no server) builds its starting doc from it. Fixed ids so every room's starter is identical. */
// JSON imports are typed loosely (type: string, not "addNode"), so the cast is needed; starter.test.ts checks it for real
export const starterOps = starterJson as unknown as Op[];

/** emptyDoc() with every starter op applied; throws if the fixture is broken (the tests catch that first) */
export function starterDoc(): Doc {
  return starterOps.reduce((doc, op) => {
    const r = applyOp(doc, op);
    if (!r.ok) throw new Error(`starter.json: ${op.opId} rejected: ${r.reason}`);
    return r.doc;
  }, emptyDoc());
}
