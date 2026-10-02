import type { Doc, Op } from "./types";
import { applyOp } from "./applyOp";

/** the Doc plus the reason the last op was rejected (null when it succeeded) */
export type State = { doc: Doc; error: string | null };

export const initialState = (doc: Doc): State => ({ doc, error: null });

/**
 * Pure: applyOp never throws and has no side effects, so StrictMode running this twice is harmless.
 *  - accepted --> new doc, error cleared
 *  - rejected --> same doc object (React skips the re-render for doc consumers), error set
 */
export function reducer(state: State, op: Op): State {
  const result = applyOp(state.doc, op);
  return result.ok
    ? { doc: result.doc, error: null }
    : { doc: state.doc, error: result.reason };
}
