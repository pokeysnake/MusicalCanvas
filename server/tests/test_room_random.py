# RANDOMIZED ROOM TEST --> THE LIVE DOC ALWAYS EQUALS A REPLAY OF THE STORED LOG
# what a late joiners snapshot rebuilds, and what persistence will rely on

import random

import pytest

from app.apply_op import Rejected
from app.doc import OUTPUT_ID
from app.rooms import Room, replay


def random_op(rng: random.Random, doc: dict, n: int) -> dict:
    # one random op built from a clients (possibly stale) view of the doc
    ids = list(doc["nodes"])
    filters = [i for i, node in doc["nodes"].items() if node["type"] == "filter"]
    roll = rng.random()
    if roll < 0.25:
        node = {
            "id": f"f{n}",
            "type": "filter",
            "position": {"x": 0, "y": 0},
            "data": {"kind": "lpf", "value": 800, "q": 0.7},
        }
        return {"type": "addNode", "opId": f"o{n}", "node": node}
    if roll < 0.6:
        # mostly filter -> filter so two stale clients wiring a -> b and b -> a race into a cycle
        pool = filters if len(filters) >= 2 else ids
        return {
            "type": "connect",
            "opId": f"o{n}",
            "source": rng.choice(pool),
            "target": rng.choice(pool),
        }
    if roll < 0.75:
        return {
            "type": "deleteElements",
            "opId": f"o{n}",
            "nodeIds": [rng.choice(ids)],
            "edgeIds": [],
        }
    if roll < 0.9:
        positions = {rng.choice(ids): {"x": n, "y": n}, "ghost": {"x": 0, "y": 0}}
        return {"type": "moveNodes", "opId": f"o{n}", "positions": positions}
    return {
        "type": "setSetting",
        "opId": f"o{n}",
        "patch": {"bpm": rng.randint(20, 260)},
    }


# 200 seeded rooms: 3 clients whose views lag behind so they keep acting on stale doc
@pytest.mark.parametrize("seed", range(200))
def test_room_doc_always_equals_a_replay_of_its_log(seed: int):
    rng = random.Random(seed)
    room = Room()
    views = [room.doc, room.doc, room.doc]
    for n in range(150):
        c = rng.randrange(3)
        result = room.try_append(random_op(rng, views[c], n))
        # a client catches up after its op is accepted or now and then anyway
        if not isinstance(result, Rejected) or rng.random() < 0.3:
            views[c] = room.doc
    assert room.doc == replay(room.ops)
    assert OUTPUT_ID in room.doc["nodes"]
