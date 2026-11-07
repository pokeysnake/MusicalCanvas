"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import type { Action } from "@/model/reducer";
import type { Op } from "@/model/types";
import { connectRoom, type RoomSocket, type Status } from "./roomSocket";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

/** Connects to /ws/{roomId} while roomId is set (null = solo, no socket). A snapshot replaces the doc,
 *  every broadcast op (including our own echo) goes to the reducer, and send() ships a local op. */
export function useRoomSocket(roomId: string | null, dispatch: Dispatch<Action>) {
  const [status, setStatus] = useState<Status>("closed");
  const room = useRef<RoomSocket | null>(null);

  useEffect(() => {
    if (!roomId) return;
    const socket = connectRoom(`${WS_URL}/ws/${roomId}`, {
      onSnapshot: (doc) => dispatch({ type: "replace", doc }),
      onOp: dispatch,
      onStatus: setStatus,
    });
    room.current = socket;
    return () => {
      socket.close();
      room.current = null;
    };
  }, [roomId, dispatch]);

  const send = useCallback((op: Op) => room.current?.send(op), []);
  return { status, send };
}
