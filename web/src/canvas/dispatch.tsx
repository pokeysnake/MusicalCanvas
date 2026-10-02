"use client";
import { createContext, useCallback, useContext, type Dispatch, type ReactNode } from "react";
import type { NodePatch, Op } from "@/model/types";

/**
 * Lets node components reach the reducer's dispatch. React Flow renders nodes itself,
 * so we can't pass dispatch down as a prop.
 * dispatch from useReducer never changes identity, so this context never causes extra re-renders.
 */
const DispatchContext = createContext<Dispatch<Op> | null>(null);

export function DispatchProvider({ dispatch, children }: { dispatch: Dispatch<Op>; children: ReactNode }) {
  return <DispatchContext value={dispatch}>{children}</DispatchContext>;
}

export function useDispatch(): Dispatch<Op> {
  const dispatch = useContext(DispatchContext);
  if (!dispatch) throw new Error("useDispatch must be used inside <DispatchProvider>");
  return dispatch;
}

/** one call = one updateNodeData op; put every field a single user action changes in the same patch */
export function useUpdateNodeData(id: string) {
  const dispatch = useDispatch();
  return useCallback(
    (patch: NodePatch) => dispatch({ type: "updateNodeData", opId: crypto.randomUUID(), id, patch }),
    [dispatch, id],
  );
}
