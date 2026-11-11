import type { ReactNode } from "react";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import "./theme.css";

export const metadata = { title: "Music Canvas" };

// data-theme picks the theme's finishes in theme.css (only "analog" exists; the colours are in globals.css)
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" data-theme="analog">
      <body>{children}</body>
    </html>
  );
}
