import type { Edge, Node } from "@xyflow/react";

/** IDs of every node that has a path to the Output node (including output itself) */
export function nodesReachingOutput(nodes: Node[], edges: Edge[]): Set<String>{
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