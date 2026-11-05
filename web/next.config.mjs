import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // the repo root, so web/ can import ../shared (fixtures used by both the client and the server);
  // Turbopack refuses files outside its root, and by default the root is web/
  turbopack: { root: fileURLToPath(new URL("..", import.meta.url)) },
};
export default nextConfig;
