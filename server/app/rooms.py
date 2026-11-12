import json
from pathlib import Path
from typing import Any

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
    def __init__(self) -> None:
        self.ops: list[dict[str, Any]] = list(STARTER)
        self.doc: dict = STARTER_DOC
        # maps each connected socket to its client id, how the room will know who to broadcast to and the sender id is how the echo gets tagged
        self.clients: dict[WebSocket, str] = {}

    @property
    def version(self) -> int:
        return len(self.ops)

    def try_append(self, op: dict[str, Any]) -> int | Rejected:
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
