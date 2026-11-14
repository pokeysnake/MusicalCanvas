import { describe, expect, it } from "vitest";
import { starterDoc } from "@/model/starter";
import { CLAIM_COLORS, claimColor, emptyUi, GROUP_PREFIX, heldByOthers, toFlowNodes } from "./flow";
import type { CatGroup } from "./sequence";

/* Drag claims on the canvas: a node someone else is dragging can't be grabbed and is outlined in their colour.
   starter: n1 (notes) -> n2 (instrument) -> n3 (lpf) -> output */

const doc = starterDoc();
const live = new Set(Object.keys(doc.nodes));
const byId = (held: Record<string, string>, groups: CatGroup[] = []) =>
  Object.fromEntries(toFlowNodes(doc, emptyUi(), live, groups, held).map((n) => [n.id, n]));

describe("claimColor", () => {
  it("is always one of the palette colours", () => {
    for (const id of ["a", "b", "c0ffee", "9f8e7d6c5b4a"]) expect(CLAIM_COLORS).toContain(claimColor(id));
  });

  it("gives the same client the same colour every time (so every screen agrees)", () => {
    expect(claimColor("abc123")).toBe(claimColor("abc123"));
  });

  it("spreads different clients over the palette", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `client${i}`);
    expect(new Set(ids.map(claimColor)).size).toBe(CLAIM_COLORS.length);
  });
});

describe("heldByOthers", () => {
  it("drops my own claims and maps the rest to their holder's colour", () => {
    expect(heldByOthers({ n1: "me", n2: "them" }, "me")).toEqual({ n2: claimColor("them") });
  });

  it("before joining (no id yet) every claim counts as someone else's", () => {
    expect(Object.keys(heldByOthers({ n1: "x" }, null))).toEqual(["n1"]);
  });
});

describe("toFlowNodes with claims", () => {
  it("a node someone else holds can't be dragged, gets is-claimed and their colour", () => {
    const n = byId({ n2: "#4fc3d9" }).n2;
    expect(n.draggable).toBe(false);
    expect(n.className).toBe("is-claimed");
    expect(n.style).toEqual({ "--claim": "#4fc3d9" });
  });

  it("nodes nobody holds are left exactly as before (no draggable, class or style keys)", () => {
    const n = byId({ n2: "#4fc3d9" }).n1;
    expect(n).not.toHaveProperty("draggable");
    expect(n).not.toHaveProperty("style");
    expect(n.className).toBeUndefined();
  });

  it("a silent node that is claimed keeps is-silent too", () => {
    const nodes = toFlowNodes(doc, emptyUi(), new Set(), [], { n1: "#f2b84b" });
    expect(nodes.find((n) => n.id === "n1")?.className).toBe("is-silent is-claimed");
  });

  it("a cat frame can't be dragged while any of its Notes is held (it would move them too)", () => {
    const box = { x: 0, y: 0, width: 10, height: 10 };
    const group: CatGroup = { instrumentId: "n2", label: "x", order: ["n1"], box, members: [box] };
    expect(byId({ n1: "#f2b84b" }, [group])[GROUP_PREFIX + "n2"].draggable).toBe(false);
    expect(byId({}, [group])[GROUP_PREFIX + "n2"].draggable).toBe(true);
  });
});
