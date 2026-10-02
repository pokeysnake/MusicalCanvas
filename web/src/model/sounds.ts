/* ---------- Approved sounds (shared by the model, the UI and the compiler) ---------- */
// Instruments store one of these ids, never a Strudel name, so what an id plays can change
// later without breaking saved rooms. Every entry was played in the Strudel REPL first.
// Stage 6: the server keeps a Python copy of this list.

export type SoundKind = "pitched" | "percussion";

export type SoundDef = {
  id: string;
  label: string;
  category: "synths" | "samples" | "drum-machines" | "wavetables";  // the tabs in strudel.cc's sounds panel
  kind: SoundKind;                                    // pitched: note("..."), percussion: rhythm via struct("...")
  strudel: { s: string; bank?: string; n?: number };  // what the compiler writes: s(...).bank(...).n(...)
};

const TR909 = "RolandTR909";
const drum909 = (s: string, label: string): SoundDef =>
  ({ id: `tr909-${s}`, label: `909 ${label}`, category: "drum-machines", kind: "percussion", strudel: { s, bank: TR909 } });

export const SOUNDS: readonly SoundDef[] = [
  { id: "saw",      label: "Saw",      category: "synths", kind: "pitched", strudel: { s: "sawtooth" } },
  { id: "square",   label: "Square",   category: "synths", kind: "pitched", strudel: { s: "square" } },
  { id: "triangle", label: "Triangle", category: "synths", kind: "pitched", strudel: { s: "triangle" } },
  { id: "sine",     label: "Sine",     category: "synths", kind: "pitched", strudel: { s: "sine" } },
  { id: "piano",    label: "Piano",    category: "samples", kind: "pitched", strudel: { s: "piano" } },
  drum909("bd", "Kick"),
  drum909("sd", "Snare"),
  drum909("hh", "Closed Hat"),
  drum909("oh", "Open Hat"),
  drum909("cp", "Clap"),
  drum909("cr", "Crash"),
];

const BY_ID = new Map(SOUNDS.map((s) => [s.id, s]));

export const DEFAULT_SOUND = "triangle";

export const getSound = (id: string): SoundDef | undefined => BY_ID.get(id);
export const isSoundId = (id: string): boolean => BY_ID.has(id);
