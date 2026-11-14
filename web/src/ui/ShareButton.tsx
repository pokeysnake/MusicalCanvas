"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SeedChoice } from "@/sync/seed";
import "./share-button.css";

/* the box widths fit their labels ("Share" / "Opening…" / "Copy link") */
const SHARE_W = 74;
const BUSY_W = 104;
const COPY_W = 112;
const resize = { type: "spring", stiffness: 500, damping: 40 } as const; // quick, no wobble
const FLIP_S = 0.14;    // label <-> checkmark flip, in seconds
const CHECK_MS = 1000;  // how long the checkmark stays once it's in

/** what each seed choice means, as shown in the menu */
const SEEDS: { choice: SeedChoice; name: string; hint: string }[] = [
  { choice: "mine", name: "My patch", hint: "what's on screen now" },
  { choice: "starter", name: "Starter", hint: "the demo graph" },
  { choice: "blank", name: "Blank", hint: "just the Output" },
];

/**
 * Share button, styled like the other top-bar buttons (.btn in globals.css: square, inked, pushes down when pressed).
 *
 * Solo (roomId null): "Share" opens a menu of what the new room starts from; picking one calls onShare(choice).
 * While the room is being made it reads "Opening…" (the server can take a while to wake up).
 * In a room: it mounts as "Share" and a moment later widens into "Copy link". Clicking copies the URL and the
 * label flips over to a checkmark for a second, then back, like a split-flap sign.
 */
export default function ShareButton({ roomId, busy = false, onShare }: {
  roomId: string | null;
  busy?: boolean;
  onShare: (choice: SeedChoice) => void;
}) {
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
  const content = copied ? "check" : isCopy ? "Copy link" : busy ? "Opening…" : "Share";

  const button = (
    <motion.button type="button" className="btn share-btn" disabled={busy}
      aria-label={copied ? "Link copied" : undefined}
      initial={false} animate={{ width: isCopy ? COPY_W : busy ? BUSY_W : SHARE_W }} transition={resize}
      onClick={isCopy ? copy : undefined}>
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

  if (roomId) return button;

  // solo: the button opens the "start the room from…" menu
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="share-menu">
        <DropdownMenuLabel className="share-menu__label">New room starts from</DropdownMenuLabel>
        {SEEDS.map((s) => (
          <DropdownMenuItem key={s.choice} className="share-menu__item" onSelect={() => onShare(s.choice)}>
            <span className="share-menu__name">{s.name}</span>
            <span className="share-menu__hint">{s.hint}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
