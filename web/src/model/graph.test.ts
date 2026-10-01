import { describe, it, expect } from "vitest";
import { nodesReachingOutput } from "./graph";

describe("nodesReachingOutput", () => {
  it("includes every node on a full chain to Output", () => {
    // Arrange: build the input
    const nodes = [
      { id: "notes", type: "notes" },
      { id: "inst",  type: "instrument" },
      { id: "out",   type: "output" },
    ];
    const edges = [
      { source: "notes", target: "inst" },
      { source: "inst",  target: "out" },
    ];

    // Act: call the function
    const live = nodesReachingOutput(nodes, edges);

    // Assert: check the answer
    expect([...live].sort()).toEqual(["inst", "notes", "out"]);
  });

  it("leaves a disconnected node out", () => {
    const nodes = [
      { id: "inst", type: "instrument" },
      { id: "lonely", type: "notes" },
      { id: "out", type: "output" },
    ];
    const edges = [{ source: "inst", target: "out" }];

    const live = nodesReachingOutput(nodes, edges);

    expect(live.has("lonely")).toBe(false);
    expect(live.has("inst")).toBe(true);
  });

  it("returns an empty set when there is no Output node", () => {
    const live = nodesReachingOutput([{ id: "a", type: "notes" }], []);
    expect(live.size).toBe(0);
  });
});