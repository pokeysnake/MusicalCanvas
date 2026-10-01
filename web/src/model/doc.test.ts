import { describe, it, expect } from "vitest";
import { emptyDoc, OUTPUT_ID } from "./doc";

describe("emptyDoc", () => {
  it("starts with exactly one Output node", () => {
    const doc = emptyDoc();
    const outputs = Object.values(doc.nodes).filter((n) => n.type === "output");
    expect(outputs).toHaveLength(1);
    expect(outputs[0].id).toBe(OUTPUT_ID);
  });

  it("returns a fresh object every call", () => {
    const a = emptyDoc();
    const b = emptyDoc();
    expect(a).toEqual(b);      // same contents
    expect(a).not.toBe(b);     // different objects
  });
});