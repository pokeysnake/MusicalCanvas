import type { Doc, Op } from "./types";
import { applyOp } from "./applyOp";

/** the Doc plus the reason the last op was rejected (null when it succeeded) */
export type State = { doc: Doc; error: string | null };

/** an Op, or "replace": swap in a whole doc (a server snapshot on join/reconnect).
 *  replace is deliberately NOT an Op: it's never sent over the wire or stored in the op log */
export type Action = Op | { type: "replace"; doc: Doc };

export const initialState = (doc: Doc): State => ({ doc, error: null });

/**
 * Pure: applyOp never throws and has no side effects, so StrictMode running this twice is harmless.
 *  - replace  --> the given doc, error cleared
 *  - accepted --> new doc, error cleared
 *  - rejected --> same doc object (React skips the re-render for doc consumers), error set
 */
export function reducer(state: State, action: Action): State {
  if (action.type === "replace") return { doc: action.doc, error: null };
  const result = applyOp(state.doc, action);
  return result.ok
    ? { doc: result.doc, error: null }
    : { doc: state.doc, error: result.reason };
}
