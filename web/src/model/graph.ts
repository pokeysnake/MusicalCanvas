import type { NodeType } from "./types";


export type NodeLike = { id: string; type?: string };
export type EdgeLike = { source: string; target: string };

/** which node types may connect to which */
const VALID_TARGETS: Record<NodeType, NodeType[]> = {
  notes:      ["instrument"],
  instrument: ["filter", "output"],
  filter:     ["filter", "output"],
  output:     [],
};

export function isValidPair(sourceType: NodeType, targetType: NodeType) : boolean {
    return VALID_TARGETS[sourceType].includes(targetType);
}

/** would adding source --> target create a loop? */
export function wouldCreateCycle(edges: EdgeLike[], source: string, target: string): boolean {
  if (source === target) return true;

  const next = new Map<string, string[]>();          // source -> [targets]
  for (const e of edges) {
    const list = next.get(e.source) ?? [];
    list.push(e.target);
    next.set(e.source, list);
  }

  // DFS forward from target looking for source
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === source) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(next.get(cur) ?? []));
  }
  return false;
}


/** IDs of every node that has a path to the Output node (including output itself) */
export function nodesReachingOutput(nodes: NodeLike[], edges: EdgeLike[]): Set<string>{
    const output = nodes.find((n) => n.type === "output");
    if(!output) return new Set();

    //build reverse lookup: target -> [sources that feed it]
    const feeders = new Map<string, string[]>();
    for( const e of edges){
        const list = feeders.get(e.target) ?? [];
        list.push(e.source);
        feeders.set(e.target, list);
    }

    //BFS backwards from output
    const reached = new Set<string>([output.id]);
    const queue = [output.id];
    while(queue.length > 0){
        const current = queue.shift()!;
        for(const src of feeders.get(current)??[]){
            if(!reached.has(src)){
                reached.add(src);
                queue.push(src);
            }
        }
    }
    return reached;
}