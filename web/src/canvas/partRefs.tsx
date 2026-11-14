"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { Doc, NodeType } from "@/model/types";

/**
 * Part numbers for the schematic look: N1, N2 (Notes), I1 (Instrument), F1 (Filter), FX1 (FX rack), OUT.
 * Display only: never stored in the Doc and never sent as ops.
 *
 * Numbered per type in the Doc's key order, which is the order the addNode ops were applied. Every client replays
 * the same op log, so everyone sees the same numbers. Deleting a part renumbers the ones added after it.
 */
export const PART_PREFIX: Record<NodeType, string> = { notes: "N", instrument: "I", filter: "F", fx: "FX", output: "OUT" };

export function partRefs(doc: Doc): Record<string, string> {
  const count: Partial<Record<NodeType, number>> = {};
  const refs: Record<string, string> = {};
  for (const n of Object.values(doc.nodes)) {
    if (n.type === "output") { refs[n.id] = PART_PREFIX.output; continue; } // there's only ever one
    const i = (count[n.type] ?? 0) + 1;
    count[n.type] = i;
    refs[n.id] = PART_PREFIX[n.type] + i;
  }
  return refs;
}

/* Node components read their number from context (React Flow renders nodes itself, so no props from EditorApp).
   Kept out of the nodes' `data` so the Doc -> React Flow mapping stays exactly the song data. */
const PartRefsContext = createContext<Record<string, string>>({});

export function PartRefsProvider({ refs, children }: { refs: Record<string, string>; children: ReactNode }) {
  return <PartRefsContext value={refs}>{children}</PartRefsContext>;
}

/** this node's part number, e.g. "N2" (empty before the provider has it) */
export function usePartRef(id: string): string {
  return useContext(PartRefsContext)[id] ?? "";
}
