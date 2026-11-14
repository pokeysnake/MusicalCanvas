/* ---------- Notes text parsing (the only file that imports Strudel's parser) ---------- */
import { parse, SyntaxError as MiniSyntaxError } from "@strudel/mini";
import type { MiniElement, MiniNode } from "@strudel/mini";

// what a step looks like, so the node can draw it without re-guessing from the text
export type StepView =
  | { kind: "note"; text: string } // c4
  | { kind: "rest" } // ~
  | { kind: "chord"; notes: string[] } // [c4,e4,g4]
  | { kind: "group"; parts: { weight: number; view: StepView }[] } // [e4 g4]: several notes squeezed into one step
  | { kind: "alt"; options: StepView[] } // <a b>: a different one each bar
  | { kind: "other"; text: string }; // anything else (g4*2, {a b}, a|b ...): shown as its text

// one chip per top-level step: "c4 [e4 g4] ~" -> "c4", "[e4 g4]", "~"
// from/to are offsets into the user's text (no surrounding quotes)
// weight: how long the step lasts compared to a plain one (c4@2 and "c4 _" are 2, c4!2 is 2 made of two c4s)
export type NotesStep = { text: string; from: number; to: number; weight: number; view: StepView };

// one step of one bar, for drawing; text is only known for top-level steps (it's the tooltip)
export type BarStep = { weight: number; view: StepView; text?: string };

// the bars a Notes text plays, in order. Everything in a Notes text fits into one bar, except a whole
// text that is one <...>: Strudel plays one option per bar, so "<[c4 e4] [g4 a4 b4]>" is two bars
export function barsOf(steps: NotesStep[]): BarStep[][] {
  if (steps.length === 0) return [];
  const only = steps.length === 1 ? steps[0] : null;
  if (only?.view.kind === "alt") {
    // a [..] option is that bar's steps; a single note fills its bar
    return only.view.options.map((o) => (o.kind === "group" ? o.parts : [{ weight: 1, view: o }]));
  }
  return [steps.map((s) => ({ weight: s.weight, view: s.view, text: s.text }))];
}

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
    const step = trimmedStep(text, 0, text.length);
    return { ok: true, steps: [{ ...step, weight: 1, view: { kind: "other", text: step.text } }] };
  }

  const steps = tree.source_.flatMap((el) =>
    el.type_ === "element" ? [{ ...elementSpan(text, el), weight: el.options_.weight, view: viewOf(text, el) }] : [],
  );
  return { ok: true, steps };
}

/* ---------- step views ---------- */
// "is this a group / chord / alternation" is read from Strudel's own tree, not guessed from brackets
// (the element's length, @2 or _, is its weight, which the caller reads)
function viewOf(text: string, el: MiniElement): StepView {
  const other: StepView = { kind: "other", text: elementSpan(text, el).text };

  // speed / chance modifiers (*2, /2, ?) are shown as written
  const { ops, reps } = el.options_;
  if (ops.some((op) => op.type_ !== "replicate")) return other;

  // c4!2: the same thing twice, sharing the element's length equally
  const inner = sourceView(text, el, other);
  if (reps > 1) return { kind: "group", parts: Array.from({ length: reps }, () => ({ weight: 1, view: inner })) };
  return inner;
}

function sourceView(text: string, el: MiniElement, other: StepView): StepView {
  const src = el.source_;
  if (src.type_ === "atom") return src.source_ === "~" || src.source_ === "-" ? { kind: "rest" } : { kind: "note", text: src.source_ };
  if (src.type_ !== "pattern") return other;

  const children = src.source_;
  switch (src.arguments_.alignment) {
    // [e4 g4]
    case "fastcat":
      return { kind: "group", parts: elementsOf(children).map((c) => ({ weight: c.options_.weight, view: viewOf(text, c) })) };

    // [c4,e4,g4]: a stack where every layer is a single plain note
    case "stack": {
      const notes: string[] = [];
      for (const layer of children) {
        const only = layer.type_ === "pattern" && layer.source_.length === 1 ? layer.source_[0] : null;
        // a chord note must be plain: no @2 or !2 inside the chord
        const view =
          only?.type_ === "element" && only.options_.weight === 1 && only.options_.reps === 1 ? viewOf(text, only) : null;
        if (view?.kind !== "note") return other;
        notes.push(view.text);
      }
      return { kind: "chord", notes };
    }

    // <a b>: Strudel wraps the options in one inner sequence
    case "polymeter_slowcat": {
      const inner = children.length === 1 ? children[0] : null;
      if (inner?.type_ !== "pattern" || inner.arguments_.alignment !== "fastcat") return other;
      return { kind: "alt", options: elementsOf(inner.source_).map((c) => viewOf(text, c)) };
    }

    default:
      return other;
  }
}

function elementsOf(nodes: MiniNode[]): MiniElement[] {
  return nodes.filter((n): n is MiniElement => n.type_ === "element");
}

// element offsets count the opening quote and include trailing whitespace
function elementSpan(text: string, el: MiniElement) {
  return trimmedStep(text, el.location_.start.offset - 1, el.location_.end.offset - 1);
}

function trimmedStep(text: string, from: number, to: number) {
  const raw = text.slice(from, to);
  const start = from + (raw.length - raw.trimStart().length);
  const stepText = raw.trim();
  return { text: stepText, from: start, to: start + stepText.length };
}
