from uuid import uuid4

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from app.protocol import ClientOpMessage, ServerOpMessage, SnapshotMessage
from app.rooms import get_room

app = FastAPI(title="Music Canvas Sync Server")

# Dev-only: the Next.js app runs on :3000. Tighten for deploy (Stage 10).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws/{room_id}")
async def room_socket(ws: WebSocket, room_id: str) -> None:
    await ws.accept()
    room = get_room(room_id)
    client_id = uuid4().hex
    # comes before snapshot because either op is already in snapshot or the client is registered and received it in broadcast
    room.clients[ws] = client_id
    snapshot = SnapshotMessage(version=room.version, clientId=client_id, ops=room.ops)
    try:
        await ws.send_text(snapshot.model_dump_json())
        while True:
            text = await ws.receive_text()
            try:
                msg = ClientOpMessage.model_validate_json(text)
            except ValidationError:
                continue
            version = room.append(msg.op)
            out = ServerOpMessage(
                op=msg.op, version=version, clientId=client_id, clientSeq=msg.clientSeq
            )
            await room.broadcast(out.model_dump_json())
    except WebSocketDisconnect:
        pass
    finally:
        room.clients.pop(ws, None)
