# SEEDED ROOMS: POST /api/rooms makes a room from the sender's ops instead of the starter
# (share from solo with "my patch", a loaded file, the starter, or blank = [])

from fastapi.testclient import TestClient

from app.main import app
from app.rooms import MAX_SEED_OPS, STARTER, replay

client = TestClient(app)

LPF = {"kind": "lpf", "value": 800, "q": 0.7}


def add_filter(node_id: str) -> dict:
    node = {"id": node_id, "type": "filter", "position": {"x": 0, "y": 0}, "data": LPF}
    return {"type": "addNode", "opId": "x", "node": node}


def bpm(n: int) -> dict:
    return {"type": "setSetting", "opId": "x", "patch": {"bpm": n}}


def seed(ops: list[dict]):
    return client.post("/api/rooms", json={"ops": ops})


def snapshot(room_id: str) -> dict:
    with client.websocket_connect(f"/ws/{room_id}") as ws:
        return ws.receive_json()


# 1. a valid seed makes a room, 201 + its id
def test_seed_returns_a_room_id():
    r = seed([bpm(90)])
    assert r.status_code == 201
    assert isinstance(r.json()["roomId"], str) and r.json()["roomId"]


# 2. joining a seeded room gives exactly the seed, not the starter
def test_seeded_room_snapshot_is_the_seed():
    ops = [bpm(90), add_filter("f1")]
    snap = snapshot(seed(ops).json()["roomId"])
    assert snap["ops"] == ops
    assert snap["version"] == len(ops)
    doc = replay(snap["ops"])
    assert doc["settings"]["bpm"] == 90
    assert "f1" in doc["nodes"]


# 3. an empty list is a blank room (version 0), NOT the starter
def test_empty_seed_is_a_blank_room():
    snap = snapshot(seed([]).json()["roomId"])
    assert snap["ops"] == []
    assert snap["version"] == 0


# 4. the starter ops as a seed is the demo room
def test_starter_seed_is_the_demo():
    snap = snapshot(seed(STARTER).json()["roomId"])
    assert snap["ops"] == STARTER


# 5. one bad op refuses the whole seed with apply_op's reason
def test_bad_op_rejects_the_seed():
    bad = {"type": "connect", "opId": "x", "source": "nope", "target": "f1"}
    r = seed([add_filter("f1"), bad])
    assert r.status_code == 422
    assert r.json() == {"detail": "node does not exist"}


# 6. ops are checked in order: a later op that depends on an earlier one is fine,
#    the same op first is not (proves the seed is folded, not checked one by one against an empty doc)
def test_seed_ops_apply_in_order():
    wire = {"type": "connect", "opId": "x", "source": "f1", "target": "f2"}
    assert seed([add_filter("f1"), add_filter("f2"), wire]).status_code == 201
    assert seed([wire, add_filter("f1"), add_filter("f2")]).status_code == 422


# 7. a missing or wrong-shaped body is refused before create_room runs
def test_bad_body_is_refused():
    assert client.post("/api/rooms", json={}).status_code == 422
    assert client.post("/api/rooms", json={"ops": "nope"}).status_code == 422


# 8. too many ops is refused
def test_too_many_ops_is_refused():
    r = seed([bpm(100)] * (MAX_SEED_OPS + 1))
    assert r.status_code == 422
    assert r.json() == {"detail": f"too many ops (max {MAX_SEED_OPS})"}


# 9. every seed gets its own room
def test_each_seed_gets_a_new_room():
    assert seed([]).json()["roomId"] != seed([]).json()["roomId"]


# 10. a seeded room is a normal room afterwards: ops build on the seed
def test_ops_build_on_the_seed():
    room = seed([add_filter("f1")]).json()["roomId"]
    with client.websocket_connect(f"/ws/{room}") as ws:
        ws.receive_json()
        ws.send_json({"type": "op", "op": bpm(120), "clientSeq": 1})
        echo = ws.receive_json()
        assert echo["type"] == "op"
        assert echo["version"] == 2
