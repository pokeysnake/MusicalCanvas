import { FILTERS, Q, type FilterKind } from "@/model/filters";
import { DEFAULT_SOUND } from "@/model/sounds";
import type { GraphNode, Position } from "@/model/types";

/* ---------- Palette (the menu of things you can drag onto the canvas) ----------
   Used by the editor's sidebar (and its drop handler). */

// no Output chip: every room starts with exactly one and it can't be deleted, so adding one is always rejected
export type PaletteItem = {
    type: "notes" | "instrument" | "filter" | "fx";
    kind?: FilterKind;   // only for filters
    label: string;
};

export const PALETTE_NODES: PaletteItem[] = [
    { type: "notes", label: "Notes" },
    { type: "instrument", label: "Instrument" },
    { type: "fx", label: "FX Rack" }, // several effects in one node; drop effect chips onto it
];

// built from the FILTERS table, so a new filter type gets a chip automatically
export const PALETTE_FILTERS: PaletteItem[] = (Object.keys(FILTERS) as FilterKind[]).map((k) => ({
    type: "filter", kind: k, label: FILTERS[k].label,
}));

// a freshly dropped node with its starting data (typed, so addNode gets a valid GraphNode)
export function newNode(item: PaletteItem, id: string, position: Position): GraphNode {
    switch (item.type) {
        case "notes": return { id, position, type: "notes", data: { name: "New melody", text: "c4 e4 g4 ~" } };
        case "instrument": return { id, position, type: "instrument", data: { sound: DEFAULT_SOUND, muted: false, solo: false } };
        case "filter": {
            const k = item.kind ?? "lpf";
            return { id, position, type: "filter", data: { kind: k, value: FILTERS[k].def, q: Q.def } };
        }
        case "fx": return { id, position, type: "fx", data: { effects: [] } }; // starts empty: add or drop effects in
    }
}

export const DRAG_TYPE = "application/musicalcanvas"; // custom type so random drags (text, files) are ignored
