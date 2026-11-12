"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import type { Op } from "@/model/types";
import type { SyncAction } from "./optimistic";
import { connectRoom, type RoomSocket, type Status } from "./roomSocket";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

/** Connects to /ws/{roomId} while roomId is set (null = solo, no socket) and turns server messages
 *  into syncReducer actions. send() ships a local op and returns its clientSeq (null = not sent). */
export function useRoomSocket(roomId: string | null, act: Dispatch<SyncAction>) {
  const [status, setStatus] = useState<Status>("closed");
  const room = useRef<RoomSocket | null>(null);

  useEffect(() => {
    if (!roomId) return;
    const socket = connectRoom(`${WS_URL}/ws/${roomId}`, {
      onSnapshot: (doc, clientId) => act({ type: "snapshot", doc, clientId }),
      onOp: (msg) => act({ type: "remote", msg }),
      onReject: (msg) => act({ type: "reject", clientSeq: msg.clientSeq, reason: msg.reason }),
      onStatus: setStatus,
    });
    room.current = socket;
    return () => {
      socket.close();
      room.current = null;
    };
  }, [roomId, act]);

  const send = useCallback((op: Op) => room.current?.send(op) ?? null, []);
  return { status, send };
}
