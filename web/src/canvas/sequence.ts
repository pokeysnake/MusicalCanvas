import { byPosition } from "@/model/compile";
import { getSound } from "@/model/sounds";
import type { Doc, GraphNode, Position } from "@/model/types";

/**
 * Drag help for cat sequencing. Several Notes wired into one Instrument play one after another (cat),
 * top to bottom by canvas y, so dragging one up or down changes the song. Everything else stacks,
 * where height doesn't matter. Pure, so the rules are tested without a browser.
 *
 * Order always comes from the compiler's own byPosition, so what the tooltip says is what plays.
 */

/** vertical space between Notes in a snapped column */
export const SEQ_GAP = 24;
/** used when React Flow hasn't measured a node yet */
const FALLBACK_HEIGHT = 80;

/** Notes ids wired into an instrument (unsorted) */
function notesInto(doc: Doc, instrumentId: string): string[] {
  return Object.values(doc.edges)
    .filter((e) => e.target === instrumentId && doc.nodes[e.source]?.type === "notes")
    .map((e) => e.source);
}

/** instrument ids a Notes node is wired into */
function instrumentsFedBy(doc: Doc, notesId: string): string[] {
  return Object.values(doc.edges)
    .filter((e) => e.source === notesId && doc.nodes[e.target]?.type === "instrument")
    .map((e) => e.target);
}

/** an instrument's Notes in play order, using live drag positions where given (same sort as compile) */
export function playOrder(doc: Doc, instrumentId: string, drag: Record<string, Position>): string[] {
  return notesInto(doc, instrumentId)
    .map((id) => ({ ...doc.nodes[id], position: drag[id] ?? doc.nodes[id].position }) as GraphNode)
    .sort(byPosition)
    .map((n) => n.id);
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 22 -> "22nd" */
export function ordinal(k: number): string {
  const teen = k % 100 >= 11 && k % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[k % 10] ?? "th";
  return `${k}${suffix}`;
}

function instrumentLabel(doc: Doc, id: string): string {
  const n = doc.nodes[id];
  return n?.type === "instrument" ? (getSound(n.data.sound)?.label ?? n.data.sound) : id;
}

export type DragHint = { text: string; reorder: boolean };

/** what the tooltip says while `id` is the node under the cursor; `drag` holds every dragged node's live position */
export function dragHint(doc: Doc, id: string, drag: Record<string, Position>): DragHint | null {
  const node = doc.nodes[id];
  if (!node || node.type === "output") return null;
  if (node.type !== "notes") return { text: "Plays together with the rest (stack): height doesn't matter", reorder: false };

  const fed = instrumentsFedBy(doc, id);
  if (fed.length === 0) return { text: "Not playing: wire it into an Instrument", reorder: false };

  const parts: string[] = [];
  let reorder = false;
  for (const inst of fed) {
    const now = playOrder(doc, inst, drag);
    const label = instrumentLabel(doc, inst);
    if (now.length < 2) {
      parts.push(`Only Notes in ${label}: height doesn't matter`);
      continue;
    }
    const before = playOrder(doc, inst, {});
    const k = now.indexOf(id) + 1;
    if (before.indexOf(id) + 1 !== k) {
      reorder = true;
      parts.push(`↕ Now plays ${ordinal(k)} of ${now.length} in ${label} · release to snap`);
    } else {
      parts.push(`Plays ${ordinal(k)} of ${now.length} in ${label}`);
    }
  }
  return { text: parts.join(" · "), reorder };
}

/**
 * On drag stop: positions that line up every sequence a dragged Notes belongs to as a tidy column,
 * in its new play order, starting where the column's top was before the drag.
 * Skipped:
 *  - a sequence whose Notes were ALL dragged (that's moving the whole column, not reordering it)
 *  - a sequence with a Notes that feeds 2+ instruments (two columns would fight over where it goes)
 */
export function snapPositions(
  doc: Doc,
  drag: Record<string, Position>,
  heightOf: (id: string) => number | undefined,
): Record<string, Position> {
  const out: Record<string, Position> = {};
  const touched = new Set(
    Object.keys(drag).flatMap((id) => (doc.nodes[id]?.type === "notes" ? instrumentsFedBy(doc, id) : [])),
  );

  for (const inst of touched) {
    const members = notesInto(doc, inst);
    if (members.length < 2) continue;
    if (members.every((id) => id in drag)) continue;
    if (members.some((id) => instrumentsFedBy(doc, id).length > 1)) continue;

    const top = doc.nodes[playOrder(doc, inst, {})[0]].position; // the column's top before the drag
    let y = top.y;
    for (const id of playOrder(doc, inst, drag)) {
      out[id] = { x: top.x, y };
      y += (heightOf(id) ?? FALLBACK_HEIGHT) + SEQ_GAP;
    }
  }
  return out;
}
