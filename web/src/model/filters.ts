/* ---------- Filter types (shared by the model, the UI and the compiler) ---------- */
export const FILTERS = {
  lpf:   { label: "Low-pass",  unit: "Hz", min: 20, max: 20000, step: 10,   def: 800,  hasQ: true },
  hpf:   { label: "High-pass", unit: "Hz", min: 20, max: 20000, step: 10,   def: 200,  hasQ: true },
  bpf:   { label: "Band-pass", unit: "Hz", min: 20, max: 20000, step: 10,   def: 1000, hasQ: true },
  room:  { label: "Reverb",    unit: "",   min: 0,  max: 1,     step: 0.05, def: 0.3,  hasQ: false },
  delay: { label: "Delay",     unit: "",   min: 0,  max: 1,     step: 0.05, def: 0.25, hasQ: false },
  gain:  { label: "Gain",      unit: "",   min: 0,  max: 2,     step: 0.05, def: 1,    hasQ: false },
} as const;

export type FilterKind = keyof typeof FILTERS;
