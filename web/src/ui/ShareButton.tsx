"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import "./share-button.css";

/* the box widths fit their labels ("Share" / "Copy link") */
const SHARE_W = 74;
const COPY_W = 112;
const resize = { type: "spring", stiffness: 500, damping: 40 } as const; // quick, no wobble
const FLIP_S = 0.14;    // label <-> checkmark flip, in seconds
const CHECK_MS = 1000;  // how long the checkmark stays once it's in

/**
 * Share button, styled like the other top-bar buttons (.btn in globals.css: square, inked, pushes down when pressed).
 *
 * Solo (roomId null): "Share"; clicking it calls onShare (which opens a new room).
 * In a room: it mounts as "Share" and a moment later widens into "Copy link". Clicking copies the URL and the
 * label flips over to a checkmark for a second, then back, like a split-flap sign.
 */
export default function ShareButton({ roomId, onShare }: { roomId: string | null; onShare: () => void }) {
  const [mode, setMode] = useState<"share" | "copy">("share");
  const [copied, setCopied] = useState(false);

  // in a room, play the widen shortly after mounting (the page just changed from solo to /room/…)
  useEffect(() => {
    if (!roomId) return;
    const t = setTimeout(() => setMode("copy"), 250);
    return () => clearTimeout(t);
  }, [roomId]);

  useEffect(() => {
    if (!copied) return;
    // the checkmark finishes flipping in, stays a full second, then flips back to the label
    const t = setTimeout(() => setCopied(false), FLIP_S * 1000 + CHECK_MS);
    return () => clearTimeout(t);
  }, [copied]);

  const isCopy = mode === "copy";
  const copy = () => {
    void navigator.clipboard.writeText(window.location.href);
    setCopied(true);
  };
  const content = copied ? "check" : isCopy ? "Copy link" : "Share";

  return (
    <motion.button type="button" className="btn share-btn"
      aria-label={copied ? "Link copied" : undefined}
      initial={false} animate={{ width: isCopy ? COPY_W : SHARE_W }} transition={resize}
      onClick={isCopy ? copy : onShare}>
      {/* old label flips up and out while the new one flips up in; both stacked in the middle */}
      <AnimatePresence initial={false}>
        <motion.span key={content} className="share-btn__face"
          initial={{ rotateX: -90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} exit={{ rotateX: 90, opacity: 0 }}
          transition={{ duration: FLIP_S, ease: "easeOut" }}>
          {copied ? <Check size={15} strokeWidth={2.5} /> : content}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
