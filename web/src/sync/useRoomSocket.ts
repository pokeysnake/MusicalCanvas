"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import type { Op } from "@/model/types";
import type { SyncAction } from "./optimistic";
import type { Claims } from "./protocol";
import { WS_URL } from "./config";
import { connectRoom, type RoomSocket, type Status } from "./roomSocket";


/** dev only: /room/abc?lag=3000 holds this tab's outgoing ops 3 s, to stage races with one mouse */
function devLagMs(): number {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return 0;
  const lag = Number(new URLSearchParams(window.location.search).get("lag"));
  return Number.isFinite(lag) && lag > 0 ? lag : 0;
}

/** Connects to /ws/{roomId} while roomId is set (null = solo, no socket) and turns server messages
 *  into syncReducer actions. send() ships a local op and returns its clientSeq (null = not sent). */
export function useRoomSocket(roomId: string | null, act: Dispatch<SyncAction>) {
  const [status, setStatus] = useState<Status>("closed");
  // who is dragging what (mine included); live only, never part of the doc
  const [claims, setClaims] = useState<Claims>({});
  const room = useRef<RoomSocket | null>(null);

  useEffect(() => {
    if (!roomId) return;
    const socket = connectRoom(`${WS_URL}/ws/${roomId}`, {
      onSnapshot: (doc, clientId, version) => act({ type: "snapshot", doc, clientId, version }),
      onOp: (msg) => act({ type: "remote", msg }),
      onReject: (msg) => act({ type: "reject", clientSeq: msg.clientSeq, reason: msg.reason }),
      onStatus: (st) => {
        setStatus(st);
        if (st === "closed") setClaims({}); // the server frees everything on disconnect; a rejoin's snapshot has the new map
      },
      onClaims: setClaims,
    }, undefined, devLagMs());
    room.current = socket;
    return () => {
      socket.close();
      room.current = null;
      setClaims({});
    };
  }, [roomId, act]);

  const send = useCallback((op: Op) => room.current?.send(op) ?? null, []);
  const claim = useCallback((ids: string[]) => room.current?.claim(ids), []);
  const release = useCallback((ids: string[]) => room.current?.release(ids), []);
  return { status, send, claims, claim, release };
}
