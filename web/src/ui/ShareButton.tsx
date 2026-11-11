"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { Check } from "lucide-react";
import { GooFilter, SQUISH, squishy, useGooId } from "./GooButton";
import "./share-button.css";

/* sizes in px; the pill widths fit their labels ("Share" / "Copy link") */
const H = 32;
const SHARE_W = 72;
const COPY_W = 104;
const spring = { type: "spring", stiffness: 260, damping: 18 } as const;
const SWAP_S = 0.15;    // label <-> checkmark animation, in seconds
const CHECK_MS = 1000;  // how long the checkmark stays once it's in

/**
 * Two swap styles for the button's content (picked with AnimatePresence's `custom`, so the leaving label uses
 * the same style as the arriving one):
 *  - "slide": Share -> Copy link, once, when the room opens
 *  - "spin":  Copy link <-> checkmark, every copy (spins and blurs through, both stacked so there's no gap)
 */
type Swap = "slide" | "spin";
const CONTENT: Variants = {
  enter: (s: Swap) => s === "spin"
    ? { opacity: 0, scale: 0.4, rotate: -90, filter: "blur(3px)" }
    : { opacity: 0, y: 6 },
  show: { opacity: 1, scale: 1, rotate: 0, y: 0, filter: "blur(0px)" },
  leave: (s: Swap) => s === "spin"
    ? { opacity: 0, scale: 0.4, rotate: 90, filter: "blur(3px)" }
    : { opacity: 0, y: -6 },
};

/**
 * Share button: one gooey pill.
 *
 * Solo (roomId null): "Share"; clicking it calls onShare (which opens a new room).
 * In a room: it mounts as "Share" and a moment later stretches into "Copy link". Clicking copies the URL and the
 * label spins into a centred checkmark for a second, then back. Only the content swaps, so the pill never
 * re-morphs.
 *
 * The goo: the pill is a plain shape on a layer with an SVG filter (blur, then a sharp alpha threshold), which
 * gives the squish its soft, melty edge, same as Play / Stop. Text sits on an unfiltered layer on top so it stays
 * crisp.
 */
export default function ShareButton({ roomId, onShare }: { roomId: string | null; onShare: () => void }) {
  const [mode, setMode] = useState<"share" | "copy">("share");
  const [copied, setCopied] = useState(false);
  const [swap, setSwap] = useState<Swap>("slide");
  const filterId = useGooId();

  // in a room, play the morph shortly after mounting (the page just changed from solo to /room/…)
  useEffect(() => {
    if (!roomId) return;
    const t = setTimeout(() => setMode("copy"), 250);
    return () => clearTimeout(t);
  }, [roomId]);

  useEffect(() => {
    if (!copied) return;
    // the checkmark finishes animating in, stays a full second, then swaps back to the label
    const t = setTimeout(() => setCopied(false), SWAP_S * 1000 + CHECK_MS);
    return () => clearTimeout(t);
  }, [copied]);

  const isCopy = mode === "copy";
  const copy = () => {
    void navigator.clipboard.writeText(window.location.href);
    setSwap("spin"); // from now on every swap is label <-> checkmark
    setCopied(true);
  };
  const content = copied ? "check" : isCopy ? "Copy link" : "Share";

  return (
    // same hover/press squish as Play and Stop (SQUISH variants): only the shape squishes, the text stays still;
    // scaling the text made it wobble and then visibly snap back into place when the spring settled
    <motion.div className="share-goo" style={{ height: H }}
      initial={false} animate={{ width: isCopy ? COPY_W : SHARE_W }}
      whileHover="hover" whileTap="tap" transition={spring}>
      <GooFilter id={filterId} />

      {/* shape only (filtered) */}
      <motion.div className="share-goo__shapes" style={{ filter: `url(#${filterId})` }}
        variants={SQUISH} transition={squishy}>
        <span className="share-goo__pill" />
      </motion.div>

      {/* text / checkmark (not filtered) */}
      <button type="button" className="share-goo__main"
        aria-label={copied ? "Link copied" : undefined}
        onClick={isCopy ? copy : onShare}>
        <AnimatePresence initial={false} custom={swap}>
          <motion.span key={content} className="share-goo__glyph" custom={swap}
            variants={CONTENT} initial="enter" animate="show" exit="leave"
            transition={swap === "spin" ? { duration: SWAP_S, ease: "easeOut" } : { duration: 0.12 }}>
            {copied ? <Check size={16} strokeWidth={2.5} /> : content}
          </motion.span>
        </AnimatePresence>
      </button>
    </motion.div>
  );
}
