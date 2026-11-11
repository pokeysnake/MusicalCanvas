"use client";
import { useId, type ReactNode } from "react";
import { motion } from "motion/react";
import "./goo-button.css";

/** a unique id for a goo filter (useId has characters that url(#…) can't take) */
export function useGooId() {
  return "goo-" + useId().replace(/[^a-zA-Z0-9]/g, "");
}

/**
 * The goo itself (used by ShareButton): blur the shapes, then keep only alpha above ~40%, so shapes that are
 * close melt into one smooth blob. The filter region is padded so shapes near the edge aren't clipped.
 */
export function GooFilter({ id }: { id: string }) {
  return (
    <svg className="goo-defs" aria-hidden="true">
      <defs>
        <filter id={id} x="-50%" y="-100%" width="200%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}

// low damping = it overshoots and wobbles back like something soft (also used by ShareButton)
export const squishy = { type: "spring", stiffness: 420, damping: 9, mass: 0.7 } as const;
/**
 * The shared hover/press squish, as motion variants. A button sets whileHover="hover" whileTap="tap" and its
 * BACKGROUND shape uses these variants, so only the shape squishes and the text stays still (scaling the text
 * made it wobble and visibly snap back). Play, Stop and Share all use this, so they feel identical.
 */
export const SQUISH = {
  hover: { scaleX: 1.04, scaleY: 1.04 },
  tap: { scaleX: 1.1, scaleY: 0.84 },
};

/**
 * A soft "marshmallow" top-bar button: hovering puffs the background up, pressing squashes it flat and wide,
 * letting go springs it back with a little wobble. While `active` (e.g. Play while playing) it slowly breathes.
 */
export default function GooButton({ children, onClick, color, ink, active = false }: {
  children: ReactNode;
  onClick: () => void;
  color: string; // background, e.g. "var(--accent)"
  ink: string;   // text colour
  active?: boolean;
}) {
  const filterId = useGooId();
  return (
    <motion.button type="button" className="goo-btn" style={{ color: ink }}
      onClick={onClick} whileHover="hover" whileTap="tap">
      <GooFilter id={filterId} />
      {/* breathing lives on its own layer so it doesn't fight the hover/press squish */}
      <motion.span className="goo-btn__breath" aria-hidden="true"
        animate={active
          ? { scale: [1, 1.05, 1], transition: { duration: 1.6, ease: "easeInOut", repeat: Infinity } }
          : { scale: 1 }}>
        {/* drawn through the same goo filter as Share's shapes, so all three buttons get identical soft corners */}
        <motion.span className="goo-btn__bg" style={{ background: color, filter: `url(#${filterId})` }}
          variants={SQUISH} transition={squishy} />
      </motion.span>
      <span className="goo-btn__label">{children}</span>
    </motion.button>
  );
}
