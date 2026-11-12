from typing import Any, Literal

from pydantic import BaseModel

# Mirrors protocol.ts in web only the envelope needs validation
# the op inside stays a plain dict

Op = dict[str, Any]  # op alias to be fixed when we move the applyOp to python


# checks incoming JSON when you call ClientOpMessage.model_validate_json(text)
# missing field or a wrong type raises ValidationError --> validate only the envelope
class ClientOpMessage(BaseModel):
    """client -> server: one local op"""

    type: Literal["op"]
    op: Op
    clientSeq: int


class SnapshotMessage(BaseModel):
    """server -> client, once on connect: the rooms whole op log"""

    type: Literal["snapshot"] = "snapshot"
    version: int
    clientId: str
    ops: list[Op]


class ServerOpMessage(BaseModel):
    """server -> every client in the room (sender included), once per op"""

    type: Literal["op"] = "op"
    op: Op
    version: int
    clientId: str  # the sender id so the sender can spot its own echo
    clientSeq: int


class RejectMessage(BaseModel):
    """server -> the sender only its op failed apply_op and was not stored"""

    type: Literal["reject"] = "reject"
    clientSeq: int
    reason: str
