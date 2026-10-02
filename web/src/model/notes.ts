/* ---------- Notes text parsing (the only file that imports Strudel's parser) ---------- */
import { parse, SyntaxError as MiniSyntaxError } from "@strudel/mini";
import type { MiniNode } from "@strudel/mini";

// one chip per top-level step: "c4 [e4 g4] ~" -> "c4", "[e4 g4]", "~"
// from/to are offsets into the user's text (no surrounding quotes)
export type NotesStep = { text: string; from: number; to: number };

export type NotesParse =
  | { ok: true; steps: NotesStep[] }
  | { ok: false; message: string; offset: number };

export function parseNotes(text: string): NotesParse {
  // blank text is valid and compiles to silence
  if (text.trim() === "") return { ok: true, steps: [] };

  // the parser reads the text as a quoted string, so a " would end it early and the
  // parser would point one character past it; catch it here to highlight the quote itself
  const quote = text.indexOf('"');
  if (quote !== -1) return { ok: false, message: 'Notes can\'t contain "', offset: quote };

  let tree: MiniNode;
  try {
    tree = parse(`"${text}"`);
  } catch (e) {
    if (!(e instanceof MiniSyntaxError)) throw e;
    // -1 for the opening quote we added; clamp so the closing quote maps to the end of the text
    const offset = Math.min(Math.max(e.location.start.offset - 1, 0), text.length);
    const message = offset === text.length ? "Unexpected end of notes (unclosed bracket?)" : `Unexpected "${text[offset]}"`;
    return { ok: false, message, offset };
  }

  // anything other than a plain sequence at the top ("c4, e4" or "c4 | e4") is one step
  if (tree.type_ !== "pattern" || tree.arguments_.alignment !== "fastcat") {
    return { ok: true, steps: [trimmedStep(text, 0, text.length)] };
  }

  // element offsets count the opening quote and include trailing whitespace
  const steps = tree.source_.flatMap((el) =>
    el.type_ === "element" ? [trimmedStep(text, el.location_.start.offset - 1, el.location_.end.offset - 1)] : [],
  );
  return { ok: true, steps };
}

function trimmedStep(text: string, from: number, to: number): NotesStep {
  const raw = text.slice(from, to);
  const start = from + (raw.length - raw.trimStart().length);
  const stepText = raw.trim();
  return { text: stepText, from: start, to: start + stepText.length };
}
