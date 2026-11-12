import { describe, expect, it } from "vitest";
import { emptyUi, toFlowNodes, type UiState } from "@/canvas/flow";
import { moveOp } from "@/canvas/ops";
import { catGroups, dragHint, snapPositions } from "@/canvas/sequence";
import { starterDoc } from "@/model/starter";
import type { Op, Position } from "@/model/types";
import { initialSync, syncReducer, type SyncAction, type SyncState } from "./optimistic";

/* Stage 6 step 5: never yank a node the local user is dragging.
   How the editor does it (nothing here is new code, these tests pin the behavior down):
   - while dragging, a node's position comes from ui.drag (local only), never from the doc,
     so ops from other people can change the doc underneath without moving it
   - on release, the move becomes a pending op, which sits on top of everyone else's ops until its echo
   starter: n1 (notes) -> n2 (instrument) -> n3 (lpf) -> output */

const ME = "me";
let version = 0;
const joined = (): SyncState =>
  syncReducer(initialSync(starterDoc()), { type: "snapshot", doc: starterDoc(), clientId: ME });
const remote = (op: Op, clientId: string, clientSeq: number): SyncAction =>
  ({ type: "remote", msg: { type: "op", op, version: ++version, clientId, clientSeq } });
const move = (id: string, p: Position): Op => ({ type: "moveNodes", opId: "x", positions: { [id]: p } });
const del = (id: string): Op => ({ type: "deleteElements", opId: "x", nodeIds: [id], edgeIds: [] });

/** where the canvas draws a node, exactly as EditorApp computes it */
const drawnAt = (s: SyncState, ui: UiState, id: string) =>
  toFlowNodes(s.doc, ui, new Set()).find((n) => n.id === id)?.position;

const MY_DRAG = { x: 300, y: 300 };
const THEIRS = { x: 900, y: 900 };
const dragging = (id: string): UiState => ({ ...emptyUi(), drag: { [id]: MY_DRAG } });

describe("never yank a node the local user is dragging", () => {
  it("someone else moving the same node mid-drag doesn't move it on my screen", () => {
    const s = syncReducer(joined(), remote(move("n1", THEIRS), "them", 1));
    expect(s.doc.nodes.n1.position).toEqual(THEIRS); // the doc did change underneath
    expect(drawnAt(s, dragging("n1"), "n1")).toEqual(MY_DRAG); // but the drag overlay wins
  });

  it("other edits mid-drag still show; only the dragged node is held", () => {
    const s = syncReducer(joined(), remote(move("n2", THEIRS), "them", 1));
    expect(drawnAt(s, dragging("n1"), "n2")).toEqual(THEIRS);
  });

  it("on release my move is pending, so their earlier move can't pull it back", () => {
    // they moved n1 while I was dragging; I release: overlay cleared, my move sent as seq 1
    let s = syncReducer(joined(), remote(move("n1", THEIRS), "them", 1));
    s = syncReducer(s, { type: "local", op: moveOp([{ id: "n1", position: MY_DRAG }]), seq: 1 });
    expect(drawnAt(s, emptyUi(), "n1")).toEqual(MY_DRAG);
    // their move was already confirmed, mine lands after it in server order: I released last, I win
    s = syncReducer(s, remote(s.pending[0].op, ME, 1));
    expect(s.confirmed.nodes.n1.position).toEqual(MY_DRAG);
  });

  it("if they release after me, it slides to theirs (last release wins, no flicker before that)", () => {
    let s = syncReducer(joined(), { type: "local", op: move("n1", MY_DRAG), seq: 1 });
    s = syncReducer(s, remote(move("n1", MY_DRAG), ME, 1));
    expect(drawnAt(s, emptyUi(), "n1")).toEqual(MY_DRAG);
    s = syncReducer(s, remote(move("n1", THEIRS), "them", 1));
    expect(drawnAt(s, emptyUi(), "n1")).toEqual(THEIRS);
  });
});

describe("someone deletes the node I'm dragging", () => {
  // delete wins: the node goes away mid-drag; nothing on my side may crash or resurrect it
  const s = syncReducer(joined(), remote(del("n1"), "them", 1));
  const ui = dragging("n1");

  it("it disappears from the canvas even though it's in ui.drag", () => {
    expect(drawnAt(s, ui, "n1")).toBeUndefined();
  });

  it("the drag tooltip, cat frames and snap all cope with the missing node", () => {
    expect(dragHint(s.doc, "n1", ui.drag)).toBeNull();
    expect(() => catGroups(s.doc, ui.drag, () => undefined)).not.toThrow();
    expect(snapPositions(s.doc, ui.drag, () => undefined)).toEqual({});
  });

  it("releasing a drag of only that node changes nothing and sends nothing pending", () => {
    const after = syncReducer(s, { type: "local", op: moveOp([{ id: "n1", position: MY_DRAG }]), seq: 1 });
    expect(after.pending).toEqual([]);
    expect(after.doc).toBe(s.doc);
  });

  it("releasing a multi-node drag still moves the nodes that are left", () => {
    const op = moveOp([{ id: "n1", position: MY_DRAG }, { id: "n2", position: { x: 5, y: 5 } }]);
    const after = syncReducer(s, { type: "local", op, seq: 1 });
    expect(after.doc.nodes.n2.position).toEqual({ x: 5, y: 5 });
    expect(after.doc.nodes.n1).toBeUndefined();
  });
});
