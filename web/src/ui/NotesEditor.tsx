"use client";
import { useState, type KeyboardEvent } from "react";
import { parseNotes } from "@/model/notes";
import { useUpdateNodeData } from "@/canvas/dispatch";
import "./notes-editor.css";

/**
 * Popup for editing a Notes node's text.
 * The draft lives only here (UI state, never in the Doc); Save sends one updateNodeData op.
 * Render it with key={nodeId} so opening another node starts a fresh draft.
 */
export default function NotesEditor({ nodeId, name, text, onClose }: {
  nodeId: string;
  name: string;
  text: string;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(text);
  const update = useUpdateNodeData(nodeId);
  const parsed = parseNotes(draft);

  const save = () => {
    if (!parsed.ok) return;
    if (draft !== text) update({ text: draft }); // no op when nothing changed
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
  };

  return (
    <div className="notes-editor__backdrop" onMouseDown={onClose}>
      {/* stop mousedown here so clicking inside the dialog doesn't count as a backdrop click */}
      <div className="notes-editor" role="dialog" aria-label={`Edit ${name}`}
        onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="notes-editor__title">{name}</div>

        <textarea className="notes-editor__input" value={draft} autoFocus spellCheck={false}
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
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="button" onClick={save} disabled={!parsed.ok}>Save</button>
        </div>
      </div>
    </div>
  );
}
