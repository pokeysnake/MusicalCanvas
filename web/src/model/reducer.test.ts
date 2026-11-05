import { describe, expect, it } from "vitest";
import { emptyDoc } from "./doc";
import { initialState, reducer } from "./reducer";
import type { Doc } from "./types";

describe("reducer: replace", () => {
  it("swaps in the whole doc (a server snapshot) and clears the last op error", () => {
    const rejected = reducer(initialState(emptyDoc()), { type: "setSetting", opId: "x", patch: { bpm: 999 } });
    expect(rejected.error).not.toBeNull();

    const snapshot: Doc = { ...emptyDoc(), settings: { bpm: 90, eq: { low: 0, mid: 0, high: 0 } } };
    const next = reducer(rejected, { type: "replace", doc: snapshot });
    expect(next.doc).toBe(snapshot);
    expect(next.error).toBeNull();
  });

  it("ops still go through applyOp", () => {
    const next = reducer(initialState(emptyDoc()), { type: "setSetting", opId: "x", patch: { bpm: 100 } });
    expect(next.doc.settings.bpm).toBe(100);
  });
});
