import os
from uuid import uuid4

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from app.apply_op import Rejected
from app.protocol import (
    ClaimMessage,
    ClaimsMessage,
    ClientMessage,
    RejectMessage,
    ReleaseMessage,
    SeedRequest,
    ServerOpMessage,
    SnapshotMessage,
)
from app.rooms import create_room, get_room

app = FastAPI(title="Music Canvas Sync Server")

# Dev-only: the Next.js app runs on :3000. Tighten for deploy (Stage 10).
ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/rooms", status_code=201)
def new_room(body: SeedRequest) -> dict[str, str]:
    """make a room seeded with the sender's ops; the client then opens /room/{roomId}"""
    result = create_room(body.ops)
    if isinstance(result, Rejected):
        raise HTTPException(status_code=422, detail=result.reason)
    return {"roomId": result}


@app.websocket("/ws/{room_id}")
async def room_socket(ws: WebSocket, room_id: str) -> None:
    await ws.accept()
    room = get_room(room_id)
    client_id = uuid4().hex
    # comes before snapshot because either op is already in snapshot or the client is registered and received it in broadcast
    room.clients[ws] = client_id
    snapshot = SnapshotMessage(
        version=room.version, clientId=client_id, ops=room.ops, claims=room.claims
    )
    try:
        await ws.send_text(snapshot.model_dump_json())
        while True:
            text = await ws.receive_text()
            try:
                # a TypeAdapter uses validate_json (model_validate_json is only on BaseModel classes)
                msg = ClientMessage.validate_json(text)
            except ValidationError:
                continue
            # claim / release --> update the map, tell everyone only if it changed
            if isinstance(msg, ClaimMessage | ReleaseMessage):
                act = room.claim if isinstance(msg, ClaimMessage) else room.release
                if act(client_id, msg.nodeIds):
                    claims = ClaimsMessage(claims=room.claims)
                    await room.broadcast(claims.model_dump_json())
                continue
            # anything else is an op: client_id lets the room refuse moves on nodes someone else holds
            version = room.try_append(msg.op, client_id)
            if isinstance(version, Rejected):
                reject = RejectMessage(clientSeq=msg.clientSeq, reason=version.reason)
                await ws.send_text(reject.model_dump_json())
                continue
            out = ServerOpMessage(
                op=msg.op, version=version, clientId=client_id, clientSeq=msg.clientSeq
            )
            await room.broadcast(out.model_dump_json())
    except WebSocketDisconnect:
        pass
    finally:
        room.clients.pop(ws, None)
        # a client that drops mid-drag must not leave its nodes locked for everyone else
        if room.release_all(client_id):
            claims = ClaimsMessage(claims=room.claims)
            await room.broadcast(claims.model_dump_json())
