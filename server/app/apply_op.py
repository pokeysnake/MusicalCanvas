# Mirrors web/src/model/applyOp.ts. The server runs every incoming op through this before it enters the log.
import math
from dataclasses import dataclass
from typing import Any

from app.doc import edge_id
from app.filters import FILTER_KINDS
from app.graph import is_valid_pair, would_create_cycle
from app.sounds import is_sound_id


# the result: Ok(doc) or Rejected(reason), like TS {ok:true,doc} | {ok:false,reason}
@dataclass(frozen=True)
class Ok:
    doc: dict


@dataclass(frozen=True)
class Rejected:
    reason: str


ApplyResult = Ok | Rejected


# number checks
# ops arrive as JSON from other clients: NaN, Infinity, "120" and True can all show up where a number belongs
def is_num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def bad_position(p: Any) -> bool:
    return not isinstance(p, dict) or not is_num(p.get("x")) or not is_num(p.get("y"))


# node data fields that hold numbers (only filters have any today)
NUMBER_FIELDS = ("value", "q")


def bad_number_field(data: dict) -> str | None:
    return next((k for k in NUMBER_FIELDS if k in data and not is_num(data[k])), None)


# node data fields that must be strings / booleans
STRING_FIELDS = ("name", "text")
BOOL_FIELDS = ("muted", "solo")


def bad_field_type(data: dict) -> str | None:
    """the first wrong typed field, ex -> name: 5 or muted: yes, else None"""
    for k in STRING_FIELDS:
        if k in data and not isinstance(data[k], str):
            return f"{k} must be a string"
    for k in BOOL_FIELDS:
        if k in data and not isinstance(data[k], bool):
            return f"{k} must be true or false"
    kind = data.get("kind")
    if "kind" in data and not (isinstance(kind, str) and kind in FILTER_KINDS):
        return f"unknown filter: {kind}"
    return None


# which data fields each node type may change; also the list of node types that exist
EDITABLE_FIELDS: dict[str, set[str]] = {
    "notes": {"name", "text"},
    "instrument": {"sound", "muted", "solo"},
    "filter": {"kind", "value", "q"},
    "fx": {"effects"},
    "output": set(),
}


def bad_effects(effects: Any) -> str | None:
    """an FX rack's effects list arrives as JSON, so check every row (None = fine, else why not).
    Each row: a non-empty str id (unique in the rack), a known kind, a finite value, an optional finite q,
    and on = True/False. Values aren't range-checked, same as Filter nodes. Mirrors badEffects in applyOp.ts."""
    if not isinstance(effects, list):
        return "effects must be a list"
    ids: set[str] = set()
    for e in effects:
        if not isinstance(e, dict):
            return "each effect must be an object"
        eid = e.get("id")
        if not isinstance(eid, str) or eid == "":
            return "each effect needs an id"
        if eid in ids:
            return f"duplicate effect id: {eid}"
        ids.add(eid)
        kind = e.get("kind")
        if not isinstance(kind, str) or kind not in FILTER_KINDS:
            return f"unknown effect: {kind}"
        if not is_num(e.get("value")):
            return "effect value must be a finite number"
        if "q" in e and not is_num(e["q"]):
            return "effect q must be a finite number"
        if not isinstance(e.get("on"), bool):
            return "effect on must be true or false"
    return None


def apply_op(doc: dict, op: dict) -> ApplyResult:
    """pure: returns Ok(new doc) or Rejected(reason); never modifies `doc` or `op`"""
    try:
        return _apply(doc, op)
    except (KeyError, TypeError, AttributeError, OverflowError):
        # the op had the wrong shape (a missing field, a list where a dict belongs, an int too big for a float).
        # Safe to reject here: _apply only ever writes to copies, so nothing was half-changed.
        return Rejected("malformed op")


def _apply(doc: dict, op: dict) -> ApplyResult:
    nodes = doc["nodes"]
    edges = doc["edges"]

    match op["type"]:
        # missing ids are SKIPPED, like deleteElements: if someone deleted one node
        # mid-drag, the rest of the drag still lands. Rejected only if NONE still exist.
        case "moveNodes":
            positions = op["positions"]
            if not positions:
                return Rejected("no nodes to move")
            if any(bad_position(p) for p in positions.values()):
                return Rejected("position must be finite numbers")
            live = {nid: p for nid, p in positions.items() if nid in nodes}
            if not live:
                return Rejected("node does not exist")
            new_nodes = dict(nodes)
            for nid, p in live.items():
                new_nodes[nid] = {**nodes[nid], "position": {"x": p["x"], "y": p["y"]}}
            return Ok({**doc, "nodes": new_nodes})

        case "addNode":
            node = op["node"]
            if node["id"] in nodes:
                return Rejected("node id already exists")
            if node["type"] == "output":
                return Rejected("a room has exactly one Output")
            if node["type"] not in EDITABLE_FIELDS:
                return Rejected(f"unknown node type: {node['type']}")
            if node["type"] == "instrument" and not is_sound_id(
                node["data"].get("sound")
            ):
                return Rejected(f"unknown sound: {node['data'].get('sound')}")
            if bad_position(node["position"]):
                return Rejected("position must be finite numbers")
            if node["type"] == "fx" and (
                why := bad_effects(node["data"].get("effects"))
            ):
                return Rejected(why)
            if bad := bad_number_field(node["data"]):
                return Rejected(f"{bad} must be a finite number")
            if why := bad_field_type(node["data"]):
                return Rejected(why)
            return Ok({**doc, "nodes": {**nodes, node["id"]: node}})

        # cheap one-lookup checks first, the full graph search last
        case "connect":
            source, target = op["source"], op["target"]
            src, tgt = nodes.get(source), nodes.get(target)
            if src is None or tgt is None:
                return Rejected("node does not exist")
            if not is_valid_pair(src["type"], tgt["type"]):
                return Rejected(f"{src['type']} cannot connect to {tgt['type']}")
            eid = edge_id(source, target)
            if eid in edges:
                return Rejected("duplicate connection")
            if would_create_cycle(edges.values(), source, target):
                return Rejected("would create a cycle")
            return Ok(
                {
                    **doc,
                    "edges": {
                        **edges,
                        eid: {"id": eid, "source": source, "target": target},
                    },
                }
            )

        # ids already gone are SKIPPED, not rejected (delete beats edits);
        # edges touching a deleted node go too; including the Output rejects the whole op
        case "deleteElements":
            gone_nodes = set(op["nodeIds"])
            gone_edges = set(op["edgeIds"])
            if not gone_nodes and not gone_edges:
                return Rejected("nothing to delete")
            if any(
                nid in nodes and nodes[nid]["type"] == "output" for nid in gone_nodes
            ):
                return Rejected("the Output node cannot be deleted")
            new_nodes = {nid: n for nid, n in nodes.items() if nid not in gone_nodes}
            new_edges = {
                eid: e
                for eid, e in edges.items()
                if eid not in gone_edges
                and e["source"] not in gone_nodes
                and e["target"] not in gone_nodes
            }
            return Ok({**doc, "nodes": new_nodes, "edges": new_edges})

        # catches what the TS type system caught for free, e.g. {sound: "square"} sent to a filter
        case "updateNodeData":
            node = nodes.get(op["id"])
            if node is None:
                return Rejected("node does not exist")
            patch = op["patch"]
            bad = [k for k in patch if k not in EDITABLE_FIELDS[node["type"]]]
            if bad:
                return Rejected(f"{node['type']} has no field(s): {', '.join(bad)}")
            if "sound" in patch and not is_sound_id(patch["sound"]):
                return Rejected(f"unknown sound: {patch['sound']}")
            if "effects" in patch and (why := bad_effects(patch["effects"])):
                return Rejected(why)
            if bad_field := bad_number_field(patch):
                return Rejected(f"{bad_field} must be a finite number")
            if why := bad_field_type(patch):
                return Rejected(why)
            updated = {**node, "data": {**node["data"], **patch}}
            return Ok({**doc, "nodes": {**nodes, op["id"]: updated}})

        # eq merges one level deeper, so {eq: {low: 3}} keeps mid and high
        case "setSetting":
            patch = op["patch"]
            if "bpm" in patch and not (
                is_num(patch["bpm"]) and 40 <= patch["bpm"] <= 240
            ):
                return Rejected("bpm must be 40-240")
            eq = patch.get("eq")
            if eq and not all(is_num(v) for v in eq.values()):
                return Rejected("eq values must be finite numbers")
            settings = {
                **doc["settings"],
                "eq": {**doc["settings"]["eq"], **(eq or {})},
            }
            if "bpm" in patch:
                settings["bpm"] = patch["bpm"]
            return Ok({**doc, "settings": settings})

        case _:
            return Rejected(f"unknown op {op['type']}")
