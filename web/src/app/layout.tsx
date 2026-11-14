import type { ReactNode } from "react";
import { Barlow, IBM_Plex_Mono } from "next/font/google";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import "./theme.css";

export const metadata = { title: "Music Canvas" };

/* Schematic fonts: Barlow is a DIN-style face (drafting labels), IBM Plex Mono for values and patterns.
   next/font self-hosts them at build time; the CSS variables feed --font-sans / --font-mono in globals.css. */
const label = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-label" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-code" });

// data-theme picks the theme's finishes in theme.css (only "schematic" exists; the colours are in globals.css)
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${label.variable} ${mono.variable}`} data-theme="schematic">
      <body>{children}</body>
    </html>
  );
}
