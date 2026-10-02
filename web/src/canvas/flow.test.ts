import { describe, expect, it } from "vitest";
import { emptyDoc, OUTPUT_ID } from "@/model/doc";
import { emptyUi, toFlowNodes } from "./flow";

describe("toFlowNodes", () => {
  it("uses the drag overlay position over the Doc position", () => {
    const ui = { ...emptyUi(), drag: { [OUTPUT_ID]: { x: 5, y: 5 } } };
    const [node] = toFlowNodes(emptyDoc(), ui, new Set([OUTPUT_ID]));
    expect(node.position).toEqual({ x: 5, y: 5 });
  });

  it("marks nodes that are not live as is-silent", () => {
    const [node] = toFlowNodes(emptyDoc(), emptyUi(), new Set());
    expect(node.className).toBe("is-silent");
  });
});
