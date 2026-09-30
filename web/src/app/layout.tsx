import type { ReactNode } from "react";
import "@xyflow/react/dist/style.css";
import "./globals.css";

export const metadata = { title: "Music Canvas" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
