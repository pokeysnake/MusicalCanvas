"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import { parseNotes } from "@/model/notes";
import { useUpdateNodeData } from "@/canvas/dispatch";
import "./notes-editor.css";

/** where the Notes node sits on screen, so the popup can grow out of it and shrink back into it */
export type Rect = { top: number; left: number; width: number; height: number };

const MORPH = { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] as const };

/** longest name a Notes node can have (fits the node's title line) */
export const NAME_MAX = 32;

/**
 * Popup for editing a Notes node's name ("Verse", "Chorus") and text.
 * The drafts live only here (UI state, never in the Doc); Save sends one updateNodeData op with just the fields
 * that changed. A blank name keeps the old one.
 * Render it with key={nodeId} so opening another node starts a fresh draft.
 *
 * Expand animation (Aceternity "expandable card" style): a blank "ghost" card is drawn exactly over the node,
 * then swapped for the dialog with the same layoutId, so motion morphs one box into the other. Closing swaps
 * back to the ghost and only calls onClose once the shrink has finished.
 */
export default function NotesEditor({ nodeId, name, text, from, onClose }: {
  nodeId: string;
  name: string;
  text: string;
  from: Rect | null; // null = node not found on screen, so just open/close with no morph
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(text);
  const [nameDraft, setNameDraft] = useState(name);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const update = useUpdateNodeData(nodeId);
  const parsed = parseNotes(draft);

  const [phase, setPhase] = useState<"opening" | "open" | "closing">(from ? "opening" : "open");
  const layoutId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // the ghost gets one frame on screen first, so motion has a starting box to morph from
  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const close = () => {
    if (!from) return onClose();
    if (phase === "closing") return;
    setPhase("closing");
    closeTimer.current = setTimeout(onClose, MORPH.duration * 1000);
  };

  const save = () => {
    if (!parsed.ok) return;
    const newName = nameDraft.trim() || name; // blank = keep the old name
    const patch = {
      ...(newName !== name ? { name: newName } : {}),
      ...(draft !== text ? { text: draft } : {}),
    };
    if (Object.keys(patch).length > 0) update(patch); // no op when nothing changed
    close();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
  };

  return (
    <>
      <motion.div className="notes-editor__backdrop" onMouseDown={close}
        initial={{ opacity: 0 }} animate={{ opacity: phase === "open" ? 1 : 0 }} transition={MORPH} />

      {phase === "open" ? (
        <div className="notes-editor__center">
          <motion.div layoutId={layoutId} transition={MORPH} style={{ borderRadius: 14 }}
            className="notes-editor" role="dialog" aria-label={`Edit ${name}`} onKeyDown={onKeyDown}>
            {/* content fades in after the card has mostly grown, so it isn't seen stretched */}
            <motion.div className="notes-editor__content"
              initial={from ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: 0.15, duration: 0.15 }}>
              {/* the name: looks like a title, edits like a field. Enter jumps down to the notes */}
              <input className="notes-editor__name" value={nameDraft} maxLength={NAME_MAX} spellCheck={false}
                aria-label="Name" placeholder={name} onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); textRef.current?.focus(); }
                }} />

              <textarea ref={textRef} className="notes-editor__input" value={draft} autoFocus spellCheck={false}
                aria-invalid={!parsed.ok} onChange={(e) => setDraft(e.target.value)} />

              {parsed.ok ? (
                <div className="notes-editor__preview">
                  {parsed.steps.length === 0
                    ? <span className="notes-editor__hint">empty: plays nothing</span>
                    : parsed.steps.map((s, i) => <span key={i} className="notes-editor__chip">{s.text}</span>)}
                </div>
              ) : (
                <div className="notes-editor__error">
                  {/* the text with the bad character marked; a space stands in when the problem is at the end */}
                  <code>
                    {draft.slice(0, parsed.offset)}
                    <mark>{draft[parsed.offset] ?? " "}</mark>
                    {draft.slice(parsed.offset + 1)}
                  </code>
                  <span>{parsed.message}</span>
                </div>
              )}

              <div className="notes-editor__actions">
                <span className="notes-editor__hint">Ctrl+Enter to save · Esc to cancel</span>
                <button type="button" className="secondary" onClick={close}>Cancel</button>
                <button type="button" onClick={save} disabled={!parsed.ok}>Save</button>
              </div>
            </motion.div>
          </motion.div>
        </div>
      ) : from && (
        // blank card sitting exactly on the node (before opening and while closing)
        <motion.div layoutId={layoutId} transition={MORPH} className="notes-editor notes-editor--ghost"
          style={{ ...from, borderRadius: 14 }} />
      )}
    </>
  );
}
