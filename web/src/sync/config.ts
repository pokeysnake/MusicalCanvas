/** where the sync server lives: websockets for rooms, plain http for creating seeded rooms (ws -> http, wss -> https) */
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
export const SERVER_HTTP = WS_URL.replace(/^ws/, "http");
