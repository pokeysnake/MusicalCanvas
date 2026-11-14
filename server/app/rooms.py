import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import WebSocket, WebSocketDisconnect

from app.apply_op import Rejected, apply_op
from app.doc import empty_doc

STARTER_PATH = (
    Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "starter.json"
)
STARTER: list[dict[str, Any]] = json.loads(STARTER_PATH.read_text(encoding="utf-8"))


def replay(ops: list[dict[str, Any]]) -> dict:
    """fold ops over an empty doc: the starter must be valid, so a reject here is a bug"""
    doc = empty_doc()
    for op in ops:
        result = apply_op(doc, op)
        if isinstance(result, Rejected):
            # ValueError, not TypeError: a bad starter.json is bad data, not a wrong type
            raise ValueError(f"starter op rejected: {result.reason}")  # noqa: TRY004
        doc = result.doc
    return doc


STARTER_DOC = replay(STARTER)

# STARTER read once at import the file never changes while the server runs, no reason to re-read it per room
# list(STARTER) copies the list so when ops are made it doesn't change the original list --> if no copy each room would have the starter with changes from the previous room
# @property lets you write room.version like a field that is always up to date
# append returns the new version without await between append and return self.version --> atomic without locks
# rooms and get_room are a dict from room id to Room, created the first time anyone connects, this is the rooms live in memory for the whole test run


class Room:
    def __init__(
        self, ops: list[dict[str, Any]] | None = None, doc: dict | None = None
    ) -> None:
        # no ops given = a plain new room seeded with STARTER like how it normally is
        self.ops: list[dict[str, Any]] = list(STARTER if ops is None else ops)
        self.doc: dict = STARTER_DOC if doc is None else doc
        # maps each connected socket to its client id, how the room will know who to broadcast to and the sender id is how the echo gets tagged
        self.clients: dict[WebSocket, str] = {}
        # nodeId -> clientId of whoever is dragging it --> the live state only never stored in ops
        self.claims: dict[str, str] = {}

    @property
    def version(self) -> int:
        return len(self.ops)

    # three claim methods
    def claim(self, client_id: str, node_ids: list[str]) -> bool:
        """take every node that is free -> returns TRUE if the map changed"""
        changed = False
        for nid in node_ids:
            if nid not in self.claims:
                self.claims[nid] = client_id
                changed = True
        return changed

    def release(self, client_id: str, node_ids: list[str]) -> bool:
        """let go of the given nodes but only the ones this client holds"""
        mine = [nid for nid in node_ids if self.claims.get(nid) == client_id]
        for nid in mine:
            del self.claims[nid]
        return bool(mine)

    def release_all(self, client_id: str) -> bool:
        """on disconnect: drop everything this client holds"""
        return self.release(client_id, list(self.claims))

    # move check
    def held_by_other(self, op: dict[str, Any], client_id: str | None) -> bool:
        """a moveNodes that touches a node someone else is dragging"""
        if op.get("type") != "moveNodes":
            return False
        positions = op.get("positions")
        if not isinstance(positions, dict):
            return False  # malformed --> let apply_op reject it with its usual reason
        return any(self.claims.get(nid, client_id) != client_id for nid in positions)

    def try_append(
        self, op: dict[str, Any], client_id: str | None = None
    ) -> int | Rejected:
        if self.held_by_other(op, client_id):
            return Rejected("node is being moved by someone else")
        result = apply_op(self.doc, op)
        if isinstance(result, Rejected):
            return result
        self.doc = result.doc
        self.ops.append(op)
        return self.version

    async def broadcast(self, text: str) -> None:
        for ws in list(self.clients):
            try:
                await ws.send_text(text)
            # WebSocketDisconnect: the connection dropped mid-send; RuntimeError: sending after the socket was closed
            except (WebSocketDisconnect, RuntimeError):
                self.clients.pop(ws, None)


rooms: dict[str, Room] = {}


def get_room(room_id: str) -> Room:
    room = rooms.get(room_id)
    if room is None:
        room = rooms[room_id] = Room()
    return room


# a big patch is a few hundred ops --> hard caps to stop someone from sending a giant list
MAX_SEED_OPS = 2000


def create_room(ops: list[dict[str, Any]]) -> str | Rejected:
    """a new room seeded with these ops instead of the starter --> every op must apply, or no room is made"""
    if len(ops) > MAX_SEED_OPS:
        return Rejected(f"too many ops (max {MAX_SEED_OPS})")
    doc = empty_doc()
    for op in ops:
        result = apply_op(doc, op)
        if isinstance(result, Rejected):
            return result
        doc = result.doc
    room_id = uuid4().hex
    rooms[room_id] = Room(ops, doc)
    return room_id
