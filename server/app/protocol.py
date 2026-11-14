from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, TypeAdapter

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


class ClaimMessage(BaseModel):
    """client -> server: I started dragging these nodes"""

    type: Literal["claim"]
    nodeIds: list[str]


class ReleaseMessage(BaseModel):
    """client -> server: I dropped these nodes"""

    type: Literal["release"]
    nodeIds: list[str]


# every message a client can send --> pydantic picks the class from the type field
# a "type" doesnt know or a missing field raises ValidationError like before

ClientMessage = TypeAdapter(
    Annotated[
        ClientOpMessage | ClaimMessage | ReleaseMessage, Field(discriminator="type")
    ]
)


class SnapshotMessage(BaseModel):
    """server -> client, once on connect: the rooms whole op log"""

    type: Literal["snapshot"] = "snapshot"
    version: int
    clientId: str
    ops: list[Op]
    claims: dict[
        str, str
    ] = {}  # nodeId -> clientId of whoever is dragging it right now


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


class ClaimsMessage(BaseModel):
    """server -> everyone in the room: who is dragging what (the entire map every time it changes)"""

    type: Literal["claims"] = "claims"
    claims: dict[str, str]  # nodeId -> clientId


class SeedRequest(BaseModel):
    """http POST /api/rooms body --> the ops a new room starts from [] = blank, the starter ops = the demo"""

    ops: list[Op]
