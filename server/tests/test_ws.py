# WEBSOCKET TESTS: /ws/{room_id}
# each test is its own function (pytest runs every def test_*); code at the top level
# runs as soon as pytest imports the file, so only setup lives up here

import json
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.rooms import replay

client = TestClient(app)

# the same file the server seeds new rooms with (tests/ -> server/ -> repo root)
STARTER = json.loads(
    (
        Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "starter.json"
    ).read_text(encoding="utf-8")
)


def new_room() -> str:
    # rooms live in memory for the whole test run, so each test uses its own
    return uuid4().hex


def op_msg(bpm: int, seq: int) -> dict:
    # a client -> server op message; setSetting is the shortest valid op (bpm must be between 40 and 240)
    return {
        "type": "op",
        "op": {"type": "setSetting", "opId": f"t{seq}", "patch": {"bpm": bpm}},
        "clientSeq": seq,
    }


def raw_msg(op: dict, seq: int) -> dict:
    # wraps any op valid or not in a client -> server envelope
    return {"type": "op", "op": op, "clientSeq": seq}


def send(ws, op: dict, seq: int) -> dict:
    # sends one op and returns the server answer to the sender: its echo or a reject
    ws.send_json(raw_msg(op, seq))
    return ws.receive_json()


def room_doc(room: str) -> dict:
    # the doc a client joining right now would build --> snapshots ops replayed
    with client.websocket_connect(f"/ws/{room}") as ws:
        return replay(ws.receive_json()["ops"])


@contextmanager
def two_clients():
    # a and b in a fresh room, snapshots already read --> yields (room, a, b)
    room = new_room()
    with (
        client.websocket_connect(f"/ws/{room}") as a,
        client.websocket_connect(f"/ws/{room}") as b,
    ):
        a.receive_json()
        b.receive_json()
        yield room, a, b


# short op builders; opId isn't checked by apply_op, so x is okay to use
def connect(source: str, target: str) -> dict:
    return {"type": "connect", "opId": "x", "source": source, "target": target}


def delete(node_ids: list[str]) -> dict:
    return {"type": "deleteElements", "opId": "x", "nodeIds": node_ids, "edgeIds": []}


def move(positions: dict) -> dict:
    return {"type": "moveNodes", "opId": "x", "positions": positions}


def update(node_id: str, patch: dict) -> dict:
    return {"type": "updateNodeData", "opId": "x", "id": node_id, "patch": patch}


def add(node_id: str, node_type: str, data: dict) -> dict:
    node = {
        "id": node_id,
        "type": node_type,
        "position": {"x": 0, "y": 0},
        "data": data,
    }
    return {"type": "addNode", "opId": "x", "node": node}


LPF = {"kind": "lpf", "value": 800, "q": 0.7}


# TESTCLIENT CHEAT SHEET
#   with client.websocket_connect(f"/ws/{room}") as ws:   opens the socket, closes it when the block ends
#       ws.receive_json()                                 blocks until the server sends something
#       ws.send_json({...})                               sends one JSON text frame
#   two clients at once = nest a second `with` inside the first
#   every client's FIRST message is its snapshot, so receive_json() it before anything else


# 1. a brand-new room starts with the starter ops (worked example, use it as the pattern)
def test_new_room_snapshot_is_the_starter():
    with client.websocket_connect(f"/ws/{new_room()}") as ws:
        snap = ws.receive_json()
        assert snap["type"] == "snapshot"
        assert snap["ops"] == STARTER
        assert snap["version"] == len(STARTER)
        assert isinstance(snap["clientId"], str) and snap["clientId"]


# 2. two clients in the same room get different clientIds
#    - one room id, two nested connections
#    - compare the clientId in each snapshot
def test_two_clients_get_different_ids():
    room = new_room()
    with (
        client.websocket_connect(f"/ws/{room}") as a,
        client.websocket_connect(f"/ws/{room}") as b,
    ):
        a_id = a.receive_json()["clientId"]
        b_id = b.receive_json()["clientId"]
        assert a_id != b_id


# 3. an op reaches every client, the sender included (the echo)
#    - a and b join, read both snapshots
#    - a sends op_msg(100, 1)
#    - BOTH receive: type "op", the same op, version len(STARTER) + 1, clientId == a's id, clientSeq 1
def test_op_is_broadcast_to_everyone_including_sender():
    room = new_room()
    with client.websocket_connect(f"/ws/{room}") as a:
        a_id = a.receive_json()["clientId"]
        with client.websocket_connect(f"/ws/{room}") as b:
            b.receive_json()  # b's snapshot

            sent = op_msg(100, 1)
            a.send_json(sent)

            # same message to both: the sender gets its echo, b gets the edit
            for ws in (a, b):
                msg = ws.receive_json()
                assert msg["type"] == "op"
                assert msg["op"] == sent["op"]
                assert msg["version"] == len(STARTER) + 1
                assert msg["clientId"] == a_id  # the SENDER's id, on b's copy too
                assert msg["clientSeq"] == 1


# 4. a client that joins after an op sees it in its snapshot
#    - a joins, sends an op, reads its echo (so you know the server stored it)
#    - c joins afterwards: snapshot version len(STARTER) + 1, last entry of ops is that op
def test_late_joiner_snapshot_includes_the_op():
    room = new_room()
    with client.websocket_connect(f"/ws/{room}") as a:
        a.receive_json()
        sent = op_msg(100, 1)
        a.send_json(sent)
        a.receive_json()  # the echo: once a has it, the server has stored the op

        with client.websocket_connect(f"/ws/{room}") as c:
            snap = c.receive_json()
            assert snap["version"] == len(STARTER) + 1
            assert snap["ops"][-1] == sent["op"]
            assert snap["ops"][:-1] == STARTER  # starter first, not seeded twice


# 5. versions go up by exactly one per op
#    - send two ops, read both echoes
#    - versions are len(STARTER) + 1, then len(STARTER) + 2
def test_versions_increase_by_one():
    with client.websocket_connect(f"/ws/{new_room()}") as a:
        a.receive_json()
        a.send_json(op_msg(100, 1))
        a.send_json(op_msg(110, 2))
        first, second = a.receive_json(), a.receive_json()
        assert (first["version"], first["clientSeq"]) == (len(STARTER) + 1, 1)
        assert (second["version"], second["clientSeq"]) == (len(STARTER) + 2, 2)


# 6. a bad envelope is ignored, not stored and not broadcast
#    - send {"type": "chat"}, then a valid op
#    - the next message received is the valid op at version len(STARTER) + 1 (so the junk wasn't appended)
def test_bad_envelope_is_ignored():
    with client.websocket_connect(f"/ws/{new_room()}") as a:
        a.receive_json()
        a.send_json({"type": "chat"})  # no op, no clientSeq, wrong type
        sent = op_msg(100, 1)
        a.send_json(sent)

        # if the junk had been stored or broadcast, this would be it (or the version would be +2)
        msg = a.receive_json()
        assert msg["op"] == sent["op"]
        assert msg["version"] == len(STARTER) + 1


# 7. rooms don't share ops
#    - a in room one sends an op and reads its echo
#    - b joins room two: its snapshot is exactly the starter
def test_rooms_are_separate():
    with client.websocket_connect(f"/ws/{new_room()}") as a:
        a.receive_json()
        a.send_json(op_msg(100, 1))
        a.receive_json()

    with client.websocket_connect(f"/ws/{new_room()}") as b:
        snap = b.receive_json()
        assert snap["ops"] == STARTER
        assert snap["version"] == len(STARTER)


# 8. a client leaving doesn't break the room
#    - a joins; b joins inside a's block and its block ends (b disconnects)
#    - a sends an op and still gets its echo
def test_disconnect_does_not_break_the_room():
    room = new_room()
    with client.websocket_connect(f"/ws/{room}") as a:
        a.receive_json()
        with client.websocket_connect(f"/ws/{room}") as b:
            b.receive_json()
        # b's block ended, so b is gone; the server must not crash broadcasting to it

        sent = op_msg(100, 1)
        a.send_json(sent)
        msg = a.receive_json()
        assert msg["op"] == sent["op"]
        assert msg["version"] == len(STARTER) + 1


# 9. an op apply_op rejects comes back to the sender as a reject
#    - bpm 999 is outside 40-240
#    - the reply is {type: "reject", clientSeq, reason} with the same reason apply_op gives
def test_invalid_op_is_rejected_to_sender():
    with client.websocket_connect(f"/ws/{new_room()}") as a:
        a.receive_json()
        a.send_json(op_msg(999, 1))
        msg = a.receive_json()
        assert msg == {"type": "reject", "clientSeq": 1, "reason": "bpm must be 40-240"}


# 10. the reject goes to the sender only
#     - a sends a bad op, then a good one
#     - b's NEXT msg is the good op: if the reject had been broadcast, b would get it first
def test_reject_is_not_broadcast():
    room = new_room()
    with client.websocket_connect(f"/ws/{room}") as a:
        a.receive_json()
        with client.websocket_connect(f"/ws/{room}") as b:
            b.receive_json()
            a.send_json(op_msg(999, 1))
            good = op_msg(100, 2)
            a.send_json(good)
            msg = b.receive_json()
            assert msg["type"] == "op"
            assert msg["op"] == good["op"]


# 11. a rejected op is not stored
#     - after a reject, the next good op is version len(STARTER) + 1
#     - a late joiner's snapshot doesnt contain the bad op
def test_rejected_op_is_not_stored():
    room = new_room()
    with client.websocket_connect(f"/ws/{room}") as a:
        a.receive_json()
        a.send_json(op_msg(999, 1))
        a.receive_json()  # the reject
        a.send_json(op_msg(100, 2))
        assert a.receive_json()["version"] == len(STARTER) + 1

    with client.websocket_connect(f"/ws/{room}") as c:
        snap = c.receive_json()
        assert len(snap["ops"]) == len(STARTER) + 1
        assert all(op.get("patch", {}).get("bpm") != 999 for op in snap["ops"])


# 12. the server checks ops against the rooms CURRENT doc with the starter included
#     - the starter already has the cable n1 -> n2
#     - connecting it again is a duplicate which apply_op only knows if the room replayed the starter
def test_ops_are_checked_against_the_room_doc():
    with client.websocket_connect(f"/ws/{new_room()}") as a:
        a.receive_json()
        a.send_json(
            raw_msg(
                {"type": "connect", "opId": "c1", "source": "n1", "target": "n2"}, 1
            )
        )
        assert a.receive_json() == {
            "type": "reject",
            "clientSeq": 1,
            "reason": "duplicate connection",
        }


# 13. two cables that together would make a loop --> the first wins, the second is rejected
#     - a adds a second filter f2 then wires n3 -> f2
#     - b then wires f2 -> n3, which would close the loop n3 -> f2 -> n3
def test_cycle_race_first_wins():
    with two_clients() as (_, a, b):
        send(a, add("f2", "filter", LPF), 1)
        b.receive_json()  # b sees f2 now
        assert send(a, connect("n3", "f2"), 2)["type"] == "op"
        b.receive_json()  # b sees a's cable now
        assert send(b, connect("f2", "n3"), 1) == {
            "type": "reject",
            "clientSeq": 1,
            "reason": "would create a cycle",
        }


# 14. connecting to a node someone just deleted is rejected
def test_connect_to_a_deleted_node_is_rejected():
    with two_clients() as (_, a, b):
        send(a, delete(["n2"]), 1)
        b.receive_json()  # b sees the delete
        assert send(b, connect("n1", "n2"), 1)["reason"] == "node does not exist"


# 15. the same node dragged by two users --> both moves are accepted the last one wins
def test_same_node_dragged_twice_last_wins():
    with two_clients() as (room, a, b):
        assert send(a, move({"n1": {"x": 1, "y": 1}}), 1)["type"] == "op"
        b.receive_json()  # b sees a's move
        assert send(b, move({"n1": {"x": 2, "y": 2}}), 1)["type"] == "op"
        assert room_doc(room)["nodes"]["n1"]["position"] == {"x": 2, "y": 2}


# 16. the same setting edited by two users: last one wins
def test_same_setting_edited_twice_last_wins():
    with two_clients() as (room, a, b):
        send(a, {"type": "setSetting", "opId": "x", "patch": {"bpm": 100}}, 1)
        b.receive_json()  # b sees bpm 100
        send(b, {"type": "setSetting", "opId": "x", "patch": {"bpm": 120}}, 1)
        assert room_doc(room)["settings"]["bpm"] == 120


# 17. the same cable drawn by two users: the second is a duplicate
#     (test 12 checks a duplicate against the starter; this one is two users racing)
def test_same_cable_twice_second_is_rejected():
    with two_clients() as (_, a, b):
        send(a, add("f2", "filter", LPF), 1)
        b.receive_json()  # b sees f2
        assert send(a, connect("n2", "f2"), 2)["type"] == "op"
        b.receive_json()  # b sees a's cable
        assert send(b, connect("n2", "f2"), 1)["reason"] == "duplicate connection"


# 18. delete beats edit: an edit to a node that was just deleted is rejected
def test_delete_beats_edit():
    with two_clients() as (_, a, b):
        send(a, delete(["n3"]), 1)
        b.receive_json()  # b sees the delete
        assert (
            send(b, update("n3", {"value": 500}), 1)["reason"] == "node does not exist"
        )


# 19. two users editing the same FX rack: the last whole list write wins
#     (no per-row ops yet, so b's list replaces a's entirely, even though they touched different rows)
def test_fx_rack_last_whole_list_wins():
    room_row = {"id": "r1", "kind": "room", "value": 0.5, "on": True}
    delay_row = {"id": "r2", "kind": "delay", "value": 0.25, "on": True}
    with two_clients() as (room, a, b):
        send(a, add("fx1", "fx", {"effects": []}), 1)
        b.receive_json()  # b sees the rack
        send(a, update("fx1", {"effects": [room_row]}), 2)
        b.receive_json()  # b sees a's list
        send(b, update("fx1", {"effects": [delay_row]}), 1)
        assert room_doc(room)["nodes"]["fx1"]["data"]["effects"] == [delay_row]


# 20. a drag that includes a node someone just deleted: the rest of the drag still lands
def test_move_with_a_deleted_node_moves_the_rest():
    with two_clients() as (room, a, b):
        send(a, delete(["n1"]), 1)
        b.receive_json()  # b sees the delete
        both = {"n1": {"x": 9, "y": 9}, "n2": {"x": 5, "y": 5}}
        assert send(b, move(both), 1)["type"] == "op"
        doc = room_doc(room)
        assert "n1" not in doc["nodes"]
        assert doc["nodes"]["n2"]["position"] == {"x": 5, "y": 5}


# DRAG CLAIMS
# claim / release are live state only: broadcast as the whole map, never stored in the op log


def claim(ws, node_ids: list[str]) -> None:
    ws.send_json({"type": "claim", "nodeIds": node_ids})


def release(ws, node_ids: list[str]) -> None:
    ws.send_json({"type": "release", "nodeIds": node_ids})


def sync(sender, *others) -> None:
    # a cheap op everyone has to read: if a claims message had been broadcast before it,
    # receive_json would return that instead, so this proves "nothing was sent"
    sender.send_json(op_msg(100, 99))
    for ws in (sender, *others):
        assert ws.receive_json()["type"] == "op"


@contextmanager
def two_clients_with_ids():
    # like two_clients but also yields each client's id --> (room, a, b, a_id, b_id)
    room = new_room()
    with (
        client.websocket_connect(f"/ws/{room}") as a,
        client.websocket_connect(f"/ws/{room}") as b,
    ):
        a_id = a.receive_json()["clientId"]
        b_id = b.receive_json()["clientId"]
        yield room, a, b, a_id, b_id


# 21. a claim is broadcast to everyone, the claimer included, as the whole map
def test_claim_is_broadcast_to_everyone():
    with two_clients_with_ids() as (_, a, b, a_id, _):
        claim(a, ["n1", "n2"])
        for ws in (a, b):
            assert ws.receive_json() == {
                "type": "claims",
                "claims": {"n1": a_id, "n2": a_id},
            }


# 22. first to start dragging wins: b's claim on a held node changes nothing, so nothing is sent
def test_first_claim_wins():
    with two_clients() as (_, a, b):
        claim(a, ["n1"])
        a.receive_json()
        b.receive_json()
        claim(b, ["n1"])
        sync(b, a)  # no claims message got in ahead of the op


# 23. a claim takes only the free nodes: b keeps n2 even though n1 was already a's
def test_claim_takes_only_free_nodes():
    with two_clients_with_ids() as (_, a, b, a_id, b_id):
        claim(a, ["n1"])
        a.receive_json()
        b.receive_json()
        claim(b, ["n1", "n2"])
        assert b.receive_json()["claims"] == {"n1": a_id, "n2": b_id}


# 24. a move on a node someone else holds is rejected; the holder's own move goes through
def test_move_on_a_node_held_by_someone_else_is_rejected():
    with two_clients() as (room, a, b):
        claim(a, ["n1"])
        a.receive_json()
        b.receive_json()
        assert send(b, move({"n1": {"x": 7, "y": 7}}), 1) == {
            "type": "reject",
            "clientSeq": 1,
            "reason": "node is being moved by someone else",
        }
        assert send(a, move({"n1": {"x": 3, "y": 3}}), 1)["type"] == "op"
        assert room_doc(room)["nodes"]["n1"]["position"] == {"x": 3, "y": 3}


# 25. a held node only blocks MOVES: b can still edit its data
def test_held_node_can_still_be_edited():
    with two_clients() as (_, a, b):
        claim(a, ["n3"])
        a.receive_json()
        b.receive_json()
        assert send(b, update("n3", {"value": 500}), 1)["type"] == "op"


# 26. after a release the node is free again: an empty map is broadcast and b can move it
def test_release_frees_the_node():
    with two_clients() as (_, a, b):
        claim(a, ["n1"])
        a.receive_json()
        b.receive_json()
        release(a, ["n1"])
        for ws in (a, b):
            assert ws.receive_json() == {"type": "claims", "claims": {}}
        assert send(b, move({"n1": {"x": 7, "y": 7}}), 1)["type"] == "op"


# 27. only the holder can release: b releasing a's node changes nothing
def test_release_by_someone_else_does_nothing():
    with two_clients() as (_, a, b):
        claim(a, ["n1"])
        a.receive_json()
        b.receive_json()
        release(b, ["n1"])
        sync(b, a)
        assert send(b, move({"n1": {"x": 7, "y": 7}}), 2)["type"] == "reject"


# 28. a client that drops mid-drag releases everything it held
def test_disconnect_releases_claims():
    room = new_room()
    with client.websocket_connect(f"/ws/{room}") as a:
        a.receive_json()
        with client.websocket_connect(f"/ws/{room}") as b:
            b_id = b.receive_json()["clientId"]
            claim(b, ["n1"])
            assert a.receive_json()["claims"] == {"n1": b_id}
        # b's block ended mid-drag
        assert a.receive_json() == {"type": "claims", "claims": {}}
        assert send(a, move({"n1": {"x": 7, "y": 7}}), 1)["type"] == "op"


# 29. a late joiner's snapshot shows who is dragging what
def test_snapshot_includes_claims():
    room = new_room()
    with client.websocket_connect(f"/ws/{room}") as a:
        a_id = a.receive_json()["clientId"]
        claim(a, ["n2"])
        a.receive_json()
        with client.websocket_connect(f"/ws/{room}") as c:
            assert c.receive_json()["claims"] == {"n2": a_id}


# 30. claims never touch the op log: the version doesn't move
def test_claims_are_not_stored_as_ops():
    room = new_room()
    with client.websocket_connect(f"/ws/{room}") as a:
        a.receive_json()
        claim(a, ["n1"])
        a.receive_json()
        release(a, ["n1"])
        a.receive_json()
    with client.websocket_connect(f"/ws/{room}") as c:
        snap = c.receive_json()
        assert snap["version"] == len(STARTER)
        assert snap["claims"] == {}
