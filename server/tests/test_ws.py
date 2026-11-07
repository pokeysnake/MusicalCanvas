# WEBSOCKET TESTS: /ws/{room_id}
# each test is its own function (pytest runs every def test_*); code at the top level
# runs as soon as pytest imports the file, so only setup lives up here

import json
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app

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
    # a client -> server op message; any op works (the server doesn't look inside), setSetting is the shortest
    return {
        "type": "op",
        "op": {"type": "setSetting", "opId": f"t{seq}", "patch": {"bpm": bpm}},
        "clientSeq": seq,
    }


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
