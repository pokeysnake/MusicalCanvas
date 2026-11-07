# MIRRORS GRAPH.TS
from collections import defaultdict, deque
from collections.abc import Iterable

# which node types may connect to which
VALID_TARGETS: dict[str, set[str]] = {
    "notes": {"instrument"},
    "instrument": {"filter", "output"},
    "filter": {"filter", "output"},
    "output": set(),
}


def is_valid_pair(source_type: str, target_type: str) -> bool:
    return target_type in VALID_TARGETS.get(source_type, set())


def would_create_cycle(edges: Iterable[dict], source: str, target: str) -> bool:
    """would adding source -> target create a loop"""
    if source == target:
        return True

    nxt: defaultdict[str, list[str]] = defaultdict(list)  # source -> [targets]
    for e in edges:
        nxt[e["source"]].append(e["target"])

    # DFS FORWARD FROM TARGET LOOKING FOR SOURCE
    seen: set[str] = set()
    stack = [target]
    while stack:
        curr = stack.pop()
        if curr == source:
            return True
        if curr in seen:
            continue
        seen.add(curr)
        stack.extend(nxt[curr])
    return False


def nodes_reaching_output(nodes: Iterable[dict], edges: Iterable[dict]) -> set[str]:
    """ids of every node with a path to the Output (Output included)"""
    output = next((n for n in nodes if n["type"] == "output"), None)
    if output is None:
        return set()

    feeders: defaultdict[str, list[str]] = defaultdict(
        list
    )  # target -> [sources feeding it]
    for e in edges:
        feeders[e["target"]].append(e["source"])

    # BFS backwards from Output
    reached = {output["id"]}
    queue = deque([output["id"]])
    while queue:
        current = queue.popleft()
        for src in feeders[current]:
            if src not in reached:
                reached.add(src)
                queue.append(src)
    return reached
