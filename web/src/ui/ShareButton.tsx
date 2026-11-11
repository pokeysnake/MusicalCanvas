"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy } from "lucide-react";
import { GooFilter, SQUISH, squishy, useGooId } from "./GooButton";
import "./share-button.css";

/* sizes in px; the pill widths fit their labels ("Share" / "Copy link" / "Copied") */
const H = 32;           // button height, also the round copy blob's diameter
const SHARE_W = 72;
const COPY_W = 104;
const GAP = 8;          // space between the pill and the blob once they've split
const OUT = COPY_W + GAP; // blob's resting x once split off
const spring = { type: "spring", stiffness: 260, damping: 18 } as const;
const SWAP_S = 0.15;    // clipboard <-> checkmark animation, in seconds
const CHECK_MS = 1000;  // how long the checkmark stays once it's in

/**
 * Share button that gooily turns into "Copy link" + a round copy-icon button.
 *
 * Solo (roomId null): a "Share" pill; clicking it calls onShare (which opens a new room).
 * In a room: it mounts as "Share" and a moment later morphs into "Copy link", with the round copy button
 * stretching out of the pill's right edge. Clicking either copies the URL; only the icon changes (clipboard ->
 * checkmark for 1s -> clipboard), so the goo animation never replays.
 *
 * The goo: pill + blob are plain shapes on a layer with an SVG filter (blur, then a sharp alpha threshold),
 * so wherever they're close their blurred edges melt together. Text/icons sit on a separate unfiltered layer
 * on top so they stay crisp.
 */
export default function ShareButton({ roomId, onShare }: { roomId: string | null; onShare: () => void }) {
  const [mode, setMode] = useState<"share" | "copy">("share");
  const [copied, setCopied] = useState(false);
  const filterId = useGooId();

  // in a room, play the morph shortly after mounting (the page just changed from solo to /room/…)
  useEffect(() => {
    if (!roomId) return;
    const t = setTimeout(() => setMode("copy"), 250);
    return () => clearTimeout(t);
  }, [roomId]);

  useEffect(() => {
    if (!copied) return;
    // the checkmark finishes animating in, stays a full second, then swaps back to the clipboard
    const t = setTimeout(() => setCopied(false), SWAP_S * 1000 + CHECK_MS);
    return () => clearTimeout(t);
  }, [copied]);

  const isCopy = mode === "copy";
  const copy = () => {
    void navigator.clipboard.writeText(window.location.href);
    setCopied(true);
  };
  const label = isCopy ? "Copy link" : "Share";

  return (
    // same hover/press squish as Play and Stop (SQUISH variants): only the shapes squish, the text stays still;
    // scaling the text made it wobble and then visibly snap back into place when the spring settled
    <motion.div className="share-goo" style={{ height: H }}
      initial={false} animate={{ width: isCopy ? OUT + H : SHARE_W }}
      whileHover="hover" whileTap="tap" transition={spring}>
      <GooFilter id={filterId} />

      {/* shapes only (filtered) */}
      <motion.div className="share-goo__shapes" style={{ filter: `url(#${filterId})` }}
        variants={SQUISH} transition={squishy}>
        <motion.span className="share-goo__pill" style={{ height: H }}
          initial={false} animate={{ width: isCopy ? COPY_W : SHARE_W }} transition={spring} />
        {/* starts tucked inside the pill's right end, then stretches out to its own spot */}
        <motion.span className="share-goo__blob" style={{ width: H, height: H }}
          initial={false} animate={{ x: isCopy ? OUT : SHARE_W - H }} transition={spring} />
      </motion.div>

      {/* text + icons (not filtered) */}
      <motion.button type="button" className="share-goo__main" style={{ height: H }}
        initial={false} animate={{ width: isCopy ? COPY_W : SHARE_W }} transition={spring}
        onClick={isCopy ? copy : onShare}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12 }}>
            {label}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {isCopy && (
          <motion.button type="button" className="share-goo__icon" style={{ left: OUT, width: H, height: H }}
            aria-label="Copy link" title="Copy link" onClick={copy}
            initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            transition={{ delay: 0.15, duration: 0.2 }}>
            {/* both icons are stacked, so the old one spins out while the new one spins in at the same time
                (no empty gap between them) */}
            <AnimatePresence initial={false}>
              <motion.span key={copied ? "check" : "copy"} className="share-goo__glyph"
                initial={{ opacity: 0, scale: 0.4, rotate: -90, filter: "blur(3px)" }}
                animate={{ opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.4, rotate: 90, filter: "blur(3px)" }}
                transition={{ duration: SWAP_S, ease: "easeOut" }}>
                {copied ? <Check size={15} strokeWidth={2.5} /> : <Copy size={15} />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
