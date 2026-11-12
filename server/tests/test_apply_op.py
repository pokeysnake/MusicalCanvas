# APPLY OP TESTS: MIRROS APPLYOP.TEST.TS CASE FOR CASE
import copy
import itertools
import math
from functools import reduce

import pytest

from app.apply_op import Ok, apply_op
from app.doc import OUTPUT_ID, edge_id, empty_doc
from app.graph import nodes_reaching_output

# BUILDERS -> make nodes and ops in one line
_counter = itertools.count(1)


def op_id() -> str:
    return f"op{next(_counter)}"


def notes(node_id: str) -> dict:
    return {
        "id": node_id,
        "type": "notes",
        "position": {"x": 0, "y": 0},
        "data": {"name": node_id, "text": "c4"},
    }


def instrument(node_id: str) -> dict:
    return {
        "id": node_id,
        "type": "instrument",
        "position": {"x": 0, "y": 0},
        "data": {"sound": "triangle", "muted": False, "solo": False},
    }


def filt(node_id: str) -> dict:
    return {
        "id": node_id,
        "type": "filter",
        "position": {"x": 0, "y": 0},
        "data": {"kind": "lpf", "value": 800, "q": 0.7},
    }


def add(node: dict) -> dict:
    return {"type": "addNode", "opId": op_id(), "node": node}


def connect(source: str, target: str) -> dict:
    return {"type": "connect", "opId": op_id(), "source": source, "target": target}


def delete(node_ids: list[str], edge_ids: list[str] | None = None) -> dict:
    return {
        "type": "deleteElements",
        "opId": op_id(),
        "nodeIds": node_ids,
        "edgeIds": edge_ids or [],
    }


# APPLY HELPERS
def must_apply(doc: dict, op: dict) -> dict:
    """apply an op that MUST succeed; fail the test loudly if its rejected"""
    r = apply_op(doc, op)
    assert isinstance(r, Ok), f"expected ok, got rejected: {r.reason}"
    return r.doc


def apply_all(doc: dict, ops: list[dict]) -> dict:
    """apply ops in order: the same replay the server does over its op log"""
    return reduce(must_apply, ops, doc)


def must_reject(doc: dict, op: dict) -> str:
    """apply an op that MUST be rejected return the reason after"""
    r = apply_op(doc, op)
    assert not isinstance(r, Ok), "expected rejection, but the op was applied"
    return r.reason


def chain_doc() -> dict:
    """n (notes) -> i (instrument) -> f (lpf) -> output"""
    return apply_all(
        empty_doc(),
        [
            add(notes("n")),
            add(instrument("i")),
            add(filt("f")),
            connect("n", "i"),
            connect("i", "f"),
            connect("f", OUTPUT_ID),
        ],
    )


# HAPPY PATHS
def test_add_node_adds_the_node():
    doc = must_apply(empty_doc(), add(notes("n1")))
    assert doc["nodes"]["n1"]["type"] == "notes"


def test_move_nodes_changes_the_position():
    op = {"type": "moveNodes", "opId": op_id(), "positions": {"n": {"x": 50, "y": 75}}}
    doc = must_apply(chain_doc(), op)
    assert doc["nodes"]["n"]["position"] == {"x": 50, "y": 75}


def test_move_nodes_moves_several_nodes_in_one_op():
    op = {
        "type": "moveNodes",
        "opId": op_id(),
        "positions": {"n": {"x": 1, "y": 2}, "i": {"x": 3, "y": 4}},
    }
    doc = must_apply(chain_doc(), op)
    assert doc["nodes"]["n"]["position"] == {"x": 1, "y": 2}
    assert doc["nodes"]["i"]["position"] == {"x": 3, "y": 4}
    assert doc["nodes"]["f"]["position"] == {"x": 0, "y": 0}  # not in the op, untouched


def test_update_node_data_changes_one_field_and_keeps_the_others():
    op = {"type": "updateNodeData", "opId": op_id(), "id": "f", "patch": {"value": 900}}
    data = must_apply(chain_doc(), op)["nodes"]["f"]["data"]
    assert data == {"kind": "lpf", "value": 900, "q": 0.7}


def test_connect_adds_an_edge_with_a_deterministic_id():
    doc = apply_all(
        empty_doc(), [add(notes("n")), add(instrument("i")), connect("n", "i")]
    )
    assert doc["edges"]["n->i"] == {"id": "n->i", "source": "n", "target": "i"}


def test_delete_elements_removes_an_edge():
    doc = must_apply(chain_doc(), delete([], ["n->i"]))
    assert "n->i" not in doc["edges"]


def test_delete_elements_removes_a_node():
    doc = must_apply(chain_doc(), delete(["n"]))
    assert "n" not in doc["nodes"]


def test_set_setting_changes_the_bpm():
    op = {"type": "setSetting", "opId": op_id(), "patch": {"bpm": 90}}
    assert must_apply(empty_doc(), op)["settings"]["bpm"] == 90


# USES PYTEST PARAMETRIZE FOR EACH PYTEST.PARAM
# Rejections: one row per rule
def move(positions: dict) -> dict:
    return {"type": "moveNodes", "opId": "x", "positions": positions}


def update(node_id: str, patch: dict) -> dict:
    return {"type": "updateNodeData", "opId": "x", "id": node_id, "patch": patch}


def setting(patch: dict) -> dict:
    return {"type": "setSetting", "opId": "x", "patch": patch}


REJECTIONS = [
    # pytest.param(op, reason the rejection must contain, id=the description pytest prints)
    #  CONNECT
    # cable to a node id that isn't in the doc
    pytest.param(
        connect("n", "ghost"), "does not exist", id="connect to a missing node"
    ),
    # notes may only feed an instrument (VALID_TARGETS), never a filter
    pytest.param(connect("n", "f"), "cannot connect", id="notes straight to a filter"),
    # chain_doc already has i->f, and the same cable always gets the same id
    pytest.param(connect("i", "f"), "duplicate", id="a duplicate cable"),
    # f->f is a loop of one; "" matches any reason (rejected is all that matters)
    pytest.param(connect("f", "f"), "", id="a node to itself"),
    #  ADD NODE
    # a room has exactly one Output, and chain_doc already has it
    pytest.param(
        add({"id": "o2", "type": "output", "position": {"x": 0, "y": 0}, "data": {}}),
        "exactly one Output",
        id="adding a second Output",
    ),
    # "n" is already in chain_doc
    pytest.param(add(notes("n")), "already exists", id="adding a duplicate id"),
    #  DELETE ELEMENTS
    # the Output can never be deleted
    pytest.param(delete([OUTPUT_ID]), "cannot be deleted", id="deleting the Output"),
    # all-or-nothing: one Output in the batch rejects the whole delete, "n" survives too
    pytest.param(
        delete(["n", OUTPUT_ID]), "cannot be deleted", id="the Output inside a batch"
    ),
    # an empty delete is a client bug, not a no-op
    pytest.param(delete([], []), "nothing to delete", id="a delete with nothing in it"),
    #  MOVE NODES
    # moving a node id that isn't in the doc
    pytest.param(
        move({"ghost": {"x": 1, "y": 1}}), "does not exist", id="moving a missing node"
    ),
    # an empty move is a client bug
    pytest.param(move({}), "no nodes", id="a move with no nodes"),
    #  UPDATE NODE DATA
    # editing a node id that isn't in the doc
    pytest.param(
        update("ghost", {"value": 1}), "does not exist", id="updating a missing node"
    ),
    # "sound" belongs to instruments; f is a filter (EDITABLE_FIELDS)
    pytest.param(
        update("f", {"sound": "square"}),
        "no field",
        id="a field from another node type",
    ),
    #  sounds: only ids in the approved list (sounds.py)
    # adding an instrument whose sound isn't in the list ("saw" is; "sawtooth" is the Strudel name)
    pytest.param(
        add(
            {
                **instrument("i2"),
                "data": {"sound": "sawtooth", "muted": False, "solo": False},
            }
        ),
        "unknown sound",
        id="an instrument with an unknown sound",
    ),
    # switching an existing instrument to a sound that isn't in the list
    pytest.param(
        update("i", {"sound": "gm_piano"}),
        "unknown sound",
        id="switching to an unknown sound",
    ),
    #  setSetting: bpm must be a real number in 40-240
    # above the max
    pytest.param(setting({"bpm": 999}), "bpm", id="bpm too high"),
    # below the min
    pytest.param(setting({"bpm": 10}), "bpm", id="bpm too low"),
    # NaN: every comparison with NaN is False, so a plain range check lets it through
    pytest.param(setting({"bpm": math.nan}), "bpm", id="bpm that is NaN"),
    # "120" is a string, not a number (in Python, comparing it with an int raises TypeError)
    pytest.param(setting({"bpm": "120"}), "bpm", id="bpm sent as a string"),
    #  every other number field gets the same finite-number check
    # new node at a NaN position
    pytest.param(
        add({**notes("n2"), "position": {"x": math.nan, "y": 0}}),
        "position",
        id="adding a node at a NaN position",
    ),
    # new filter with a NaN cutoff value
    pytest.param(
        add({**filt("f2"), "data": {"kind": "lpf", "value": math.nan, "q": 0.7}}),
        "value",
        id="adding a filter with a NaN value",
    ),
    # new filter with q sent as a string
    pytest.param(
        add({**filt("f2"), "data": {"kind": "lpf", "value": 800, "q": "1"}}),
        "q",
        id="adding a filter with a string q",
    ),
    # dragging a node to a NaN y
    pytest.param(
        move({"n": {"x": 1, "y": math.nan}}), "position", id="moving to a NaN position"
    ),
    # dragging a node to infinity (Python's json parses "Infinity", so this can arrive)
    pytest.param(
        move({"n": {"x": math.inf, "y": 1}}), "position", id="moving to Infinity"
    ),
    # editing a filter's value to NaN
    pytest.param(
        update("f", {"value": math.nan}), "value", id="a filter value that is NaN"
    ),
    # editing a filter's q to a string
    pytest.param(update("f", {"q": "2"}), "q", id="a filter q sent as a string"),
    # one EQ band that is NaN
    pytest.param(
        setting({"eq": {"low": math.nan, "mid": 0, "high": 0}}),
        "eq",
        id="an eq band that is NaN",
    ),
    #  Python-only: the server gets raw JSON, so TypeScript's types aren't there to help
    # True is an int in Python (True == 1), so the number check must exclude bool
    pytest.param(
        setting({"bpm": True}),
        "bpm",
        id="bpm sent as a bool (bool is an int in Python)",
    ),
    # TS's union type made this impossible; raw JSON can say anything
    pytest.param(
        add({**notes("n2"), "type": "banana"}),
        "unknown node type",
        id="adding an unknown node type",
    ),
    # an op type apply_op has no case for (the TS `default:` branch)
    pytest.param(
        {"type": "explode", "opId": "x"}, "unknown op", id="an unknown op type"
    ),
    # connect with no "target": must reject, not raise KeyError and kill the socket
    pytest.param(
        {"type": "connect", "opId": "x", "source": "n"},
        "malformed",
        id="an op missing a field",
    ),
    # a null position must reject, not crash on None["x"]
    pytest.param(move({"n": None}), "position", id="moving to a null position"),
    # raw JSON can put any type in any field; these used to be accepted
    pytest.param(
        update("n", {"name": 5}), "name must be a string", id="a non-string Notes name"
    ),
    pytest.param(
        update("n", {"text": None}), "text must be a string", id="a null Notes text"
    ),
    pytest.param(
        update("i", {"muted": "yes"}),
        "muted must be true or false",
        id="a non-bool muted",
    ),
    # isinstance(1, bool) is False, so the number 1 is not a bool (the reverse of the bool-is-int trap)
    pytest.param(
        update("i", {"solo": 1}), "solo must be true or false", id="solo sent as 1"
    ),
    pytest.param(
        update("f", {"kind": "banana"}), "unknown filter", id="an unknown filter kind"
    ),
    # a list can't be looked up in a set, so this must reject, not raise TypeError
    pytest.param(
        update("f", {"kind": ["lpf"]}),
        "unknown filter",
        id="a filter kind that isn't a string",
    ),
    pytest.param(
        add({**notes("n2"), "data": {"name": 5, "text": ""}}),
        "name must be a string",
        id="adding Notes with a bad name",
    ),
]


@pytest.mark.parametrize(("op", "reason"), REJECTIONS)
def test_rejects(op: dict, reason: str):
    assert reason in must_reject(chain_doc(), op)


# Cycles: the trickiest rule
def test_rejects_a_2_filter_loop():
    doc = apply_all(empty_doc(), [add(filt("a")), add(filt("b")), connect("a", "b")])
    assert "cycle" in must_reject(doc, connect("b", "a"))


def test_rejects_a_3_filter_loop():
    doc = apply_all(
        empty_doc(),
        [
            add(filt("a")),
            add(filt("b")),
            add(filt("c")),
            connect("a", "b"),
            connect("b", "c"),
        ],
    )
    assert "cycle" in must_reject(doc, connect("c", "a"))


def test_allows_a_diamond():
    # i -> a -> output  and  i -> b -> output: two paths to one node is NOT a loop
    doc = apply_all(
        empty_doc(),
        [
            add(instrument("i")),
            add(filt("a")),
            add(filt("b")),
            connect("i", "a"),
            connect("i", "b"),
            connect("a", OUTPUT_ID),
            connect("b", OUTPUT_ID),
        ],
    )
    assert len(doc["edges"]) == 4


def test_allows_a_long_chain_of_filters():
    doc = apply_all(
        empty_doc(),
        [
            add(instrument("i")),
            add(filt("a")),
            add(filt("b")),
            add(filt("c")),
            connect("i", "a"),
            connect("a", "b"),
            connect("b", "c"),
            connect("c", OUTPUT_ID),
        ],
    )
    assert edge_id("c", OUTPUT_ID) in doc["edges"]


# Purity: the input doc is never modified
# one op of every type, accepted and rejected alike; none may touch the doc it was given
PURITY_OPS = [
    pytest.param(move({"n": {"x": 9, "y": 9}}), id="moveNodes"),
    pytest.param(update("f", {"value": 900}), id="updateNodeData"),
    pytest.param(delete(["i"]), id="deleteElements a node"),
    pytest.param(delete([], ["n->i"]), id="deleteElements an edge"),
    pytest.param(setting({"eq": {"low": 3}}), id="setSetting eq"),
    pytest.param(add(notes("new")), id="addNode"),
    pytest.param(connect("f", "i"), id="a rejected connect (would loop i->f->i)"),
    pytest.param(
        move({"n": {"x": 9, "y": 9}, "ghost": {"x": 1, "y": 1}}),
        id="a move with one missing id",
    ),
    pytest.param(
        delete(["n", OUTPUT_ID]), id="a delete that includes the Output deletes nothing"
    ),
]


@pytest.mark.parametrize("op", PURITY_OPS)
def test_never_modifies_the_input_doc(op: dict):
    doc = chain_doc()
    before = copy.deepcopy(doc)
    apply_op(doc, op)
    assert doc == before


# Side effects: the "remember to also..." behavior
def test_delete_skips_ids_that_are_already_gone():
    # someone else deleted "ghost" and "a->b" first; this delete still did what was meant
    doc = must_apply(chain_doc(), delete(["ghost", "n"], ["a->b"]))
    assert "n" not in doc["nodes"]
    assert len(doc["nodes"]) == 3  # i, f, output


def test_delete_with_only_missing_ids_succeeds_and_changes_nothing():
    start = chain_doc()
    assert must_apply(start, delete(["ghost"], ["a->b"])) == start


def test_move_skips_ids_that_are_already_gone():
    doc = must_apply(
        chain_doc(), move({"n": {"x": 9, "y": 9}, "ghost": {"x": 1, "y": 1}})
    )
    assert doc["nodes"]["n"]["position"] == {"x": 9, "y": 9}
    assert "ghost" not in doc["nodes"]


def test_delete_removes_nodes_and_unrelated_edges_in_one_op():
    doc = must_apply(chain_doc(), delete(["n"], [edge_id("f", OUTPUT_ID)]))
    assert "n" not in doc["nodes"]
    assert "n->i" not in doc["edges"]  # attached to n
    assert edge_id("f", OUTPUT_ID) not in doc["edges"]  # named directly
    assert "i->f" in doc["edges"]  # untouched


def test_deleting_a_node_removes_every_edge_touching_it():
    doc = must_apply(chain_doc(), delete(["i"]))
    assert "n->i" not in doc["edges"]
    assert "i->f" not in doc["edges"]
    assert edge_id("f", OUTPUT_ID) in doc["edges"]  # unrelated edge survives


def test_an_eq_patch_keeps_the_other_bands():
    doc = must_apply(empty_doc(), setting({"eq": {"low": 3}}))
    assert doc["settings"]["eq"] == {"low": 3, "mid": 0, "high": 0}


def test_a_set_setting_without_bpm_keeps_the_bpm():
    doc = must_apply(empty_doc(), setting({"eq": {"low": 1, "mid": 2, "high": 3}}))
    assert doc["settings"]["bpm"] == 120


def test_after_deleting_the_instrument_its_notes_no_longer_reach_output():
    before = chain_doc()
    assert "n" in nodes_reaching_output(
        before["nodes"].values(), before["edges"].values()
    )

    after = must_apply(before, delete(["i"]))
    assert "n" not in nodes_reaching_output(
        after["nodes"].values(), after["edges"].values()
    )


# Sequences: several ops in a row
def test_builds_the_mockup_graph():
    # 3 notes -> 3 instruments -> 1 filter -> output
    doc = apply_all(
        empty_doc(),
        [
            add(notes("n1")),
            add(notes("n2")),
            add(notes("n3")),
            add(instrument("i1")),
            add(instrument("i2")),
            add(instrument("i3")),
            add(filt("f")),
            connect("n1", "i1"),
            connect("n2", "i2"),
            connect("n3", "i3"),
            connect("i1", "f"),
            connect("i2", "f"),
            connect("i3", "f"),
            connect("f", OUTPUT_ID),
        ],
    )
    assert len(doc["nodes"]) == 8  # 7 added + Output
    assert len(doc["edges"]) == 7
    live = nodes_reaching_output(doc["nodes"].values(), doc["edges"].values())
    assert len(live) == 8  # everything is connected


def test_disconnecting_then_reconnecting_returns_to_the_same_edges():
    start = chain_doc()
    end = apply_all(start, [delete([], ["i->f"]), connect("i", "f")])
    assert end["edges"] == start["edges"]


def test_the_starter_fixture_applies_cleanly():
    # the file every new room is seeded with; if apply_op rejected any of it, every room would start broken
    from app.rooms import STARTER

    doc = apply_all(empty_doc(), STARTER)
    assert len(doc["nodes"]) == 4
    assert len(doc["edges"]) == 3


# FX RACK: one node holding several effects (mirrors "applyOp: fx rack" in applyOp.test.ts)
def fx(node_id: str, effects: list | None = None) -> dict:
    return {
        "id": node_id,
        "type": "fx",
        "position": {"x": 0, "y": 0},
        "data": {
            "effects": effects
            if effects is not None
            else [{"id": "e1", "kind": "lpf", "value": 800, "q": 0.7, "on": True}]
        },
    }


def set_effects(node_id: str, effects) -> dict:
    return {
        "type": "updateNodeData",
        "opId": op_id(),
        "id": node_id,
        "patch": {"effects": effects},
    }


def test_adds_an_fx_rack_and_wires_instrument_fx_output():
    doc = apply_all(
        empty_doc(),
        [
            add(notes("n")),
            add(instrument("i")),
            add(fx("x")),
            connect("n", "i"),
            connect("i", "x"),
            connect("x", OUTPUT_ID),
        ],
    )
    assert doc["nodes"]["x"]["type"] == "fx"
    assert sorted(doc["edges"]) == sorted(["n->i", "i->x", f"x->{OUTPUT_ID}"])


def test_an_empty_rack_is_allowed():
    assert "x" in must_apply(empty_doc(), add(fx("x", [])))["nodes"]


def test_fx_can_sit_next_to_filters():
    doc = apply_all(
        empty_doc(),
        [
            add(filt("f1")),
            add(fx("x1")),
            add(fx("x2")),
            add(filt("f2")),
            connect("f1", "x1"),
            connect("x1", "x2"),
            connect("x2", "f2"),
        ],
    )
    assert len(doc["edges"]) == 3


def test_notes_cannot_plug_straight_into_an_fx_rack():
    doc = apply_all(empty_doc(), [add(notes("n")), add(fx("x"))])
    assert must_reject(doc, connect("n", "x")) == "notes cannot connect to fx"


def test_rejects_a_loop_through_fx_racks():
    doc = apply_all(empty_doc(), [add(fx("a")), add(fx("b")), connect("a", "b")])
    assert must_reject(doc, connect("b", "a")) == "would create a cycle"


def test_update_node_data_replaces_the_whole_effects_list():
    doc = must_apply(empty_doc(), add(fx("x")))
    effects = [
        {"id": "e1", "kind": "lpf", "value": 1200, "q": 0.7, "on": False},
        {"id": "e2", "kind": "room", "value": 0.4, "on": True},
    ]
    assert must_apply(doc, set_effects("x", effects))["nodes"]["x"]["data"] == {
        "effects": effects
    }


_ROW = {"id": "e1", "kind": "lpf", "value": 800, "on": True}


@pytest.mark.parametrize(
    ("effects", "reason"),
    [
        pytest.param("lpf", "effects must be a list", id="not a list"),
        pytest.param([None], "each effect must be an object", id="row not an object"),
        pytest.param([{**_ROW, "id": ""}], "each effect needs an id", id="empty id"),
        pytest.param([_ROW, {**_ROW}], "duplicate effect id: e1", id="duplicate id"),
        pytest.param(
            [{**_ROW, "kind": "chorus"}], "unknown effect: chorus", id="unknown kind"
        ),
        pytest.param(
            [{**_ROW, "value": math.nan}],
            "effect value must be a finite number",
            id="NaN value",
        ),
        pytest.param(
            [{**_ROW, "value": "800"}],
            "effect value must be a finite number",
            id="string value",
        ),
        pytest.param(
            [{**_ROW, "q": math.inf}],
            "effect q must be a finite number",
            id="infinite q",
        ),
        pytest.param(
            [{**_ROW, "on": 1}], "effect on must be true or false", id="on not a bool"
        ),
    ],
)
def test_rejects_bad_effects_lists(effects, reason: str):
    doc = must_apply(empty_doc(), add(fx("x")))
    assert must_reject(doc, set_effects("x", effects)) == reason
    assert must_reject(empty_doc(), add(fx("y", effects))) == reason


def test_fx_only_takes_effects_and_other_nodes_dont_take_it():
    doc = apply_all(empty_doc(), [add(fx("x")), add(filt("f"))])
    patch_value = {
        "type": "updateNodeData",
        "opId": op_id(),
        "id": "x",
        "patch": {"value": 5},
    }
    assert must_reject(doc, patch_value) == "fx has no field(s): value"
    assert must_reject(doc, set_effects("f", [])) == "filter has no field(s): effects"


def test_fx_ops_never_modify_the_input_doc():
    doc = must_apply(empty_doc(), add(fx("x")))
    before = copy.deepcopy(doc)
    apply_op(doc, set_effects("x", []))
    apply_op(doc, set_effects("x", "bad"))
    assert doc == before
