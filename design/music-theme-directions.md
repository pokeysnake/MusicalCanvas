# Music Canvas: music-themed design directions

> **Status (2026-11-10):** Warm Analog is live in the editor (tokens in `web/src/app/globals.css`, finishes in
> `web/src/app/theme.css`, cables in `web/src/canvas/CableEdge.tsx`). The FX rack is built for real (see below).
> The `/mockups` page was removed; Studio Rack and Punk are kept as CSS in `design/themes-archive.css`.

Drafted with the design plugin's `/design-system extend`.

## Problem

The current UI is a clean, dark, minimal tool. It reads well but doesn't feel like music gear:
- Nodes are flat grey cards that differ only by a small coloured label.
- Wires are thin grey lines that look like a diagram, not a signal chain.
- Colour is mostly reserved for tiny accents, so the canvas looks monochrome.

Goal: make it feel like patching real gear (texture, cables, colour) **without** losing the flow-chart
readability. You should still be able to follow every wire from Notes to Output at a glance.

## What stays the same (all directions)

- Layout: top bar, canvas, sidebar, EQ bar.
- Node anatomy: eyebrow label, title, controls, handles. Only the skin changes.
- Motion: the Notes popup growing out of its node, the frosted blur, the gooey Share button and the squishy
  Play/Stop all carry over. They read their colours from the same tokens, so they re-theme automatically.
- Cat groups: the frame, numbered badges and flowing link all stay. The frame takes the instrument colour.

## New patterns (shared by all directions)

### 1. Colour-coded faceplates

Every node type gets its own colour token (`--nc`, "node colour") and shows it in three places:
- a 3px coloured strip along the top edge (like a module's faceplate stripe)
- a tinted border
- its handles, which become jack sockets (a dark hole ringed in the node colour)

| Node | Token | Why |
|---|---|---|
| Notes | `--notes` | The source of the music |
| Instrument | `--instrument` | Also the cat group frame colour |
| Filter | `--filter` | Effects pedals |
| Output | `--output` (**new**) | Speakers; previously Output had no colour |

### 2. Patch cables (new `cable` edge type)

| Property | Value | Notes |
|---|---|---|
| Shape | Cubic bezier with a small downward **sag** | Sag = 12% of the cable's length, capped at 40px, like a cable hanging under gravity. One gentle curve, never an S-wiggle, so it stays easy to follow. |
| Colour | Gradient from the source node's colour to the target's | You can see which way the signal flows and which two things are patched together. |
| Layers | dark shadow, coloured core, thin highlight on top | Reads as a round rubber cable instead of a line. |
| Plugs | Small rounded caps at each end | Sit over the jack sockets. |
| Selected | Core gets thicker | Same selection behaviour as today. |

Each direction changes only the cable finish: glossy rubber, neon glow or braided cloth.

### 3. Node texture

Done in pure CSS (gradients plus an inline SVG noise filter), with no image files. The textures are subtle
(about 2–8% opacity) so text and controls stay readable.

## Direction A: Studio Rack

Feels like a modular synth rack.

| Token | Value |
|---|---|
| `--bg` / canvas | `#0f121a` with a soft navy glow in the top-left |
| `--tile` (node) | `#1c2230` |
| `--notes` | `#4fe3b5` mint |
| `--instrument` / `--accent` | `#9b8cff` violet |
| `--filter` | `#ffb347` amber |
| `--output` | `#ff6b8a` coral |

- **Texture:** brushed-metal grain, plus two screw heads in the bottom corners of every node.
- **Cables:** thick glossy rubber patch cords with a highlight.
- **Feel:** the most "hardware" option. Readable, and still close to today's look.

*(Direction B, Neon Tape, was dropped on 2026-11-10. So was the "Current" comparison tab; the live editor at `/`
already shows today's look.)*

## Direction C: Warm Analog (chosen)

A vintage studio: wood, felt, cloth-braided cables.

| Token | Value |
|---|---|
| `--bg` / canvas | `#1b1714` warm charcoal |
| `--tile` (node) | `#2b2520` |
| `--notes` | `#7cc6a4` sage |
| `--instrument` / `--accent` | `#e8a33d` mustard |
| `--filter` | `#e2583e` tomato |
| `--output` | `#6aa6d6` denim |
| `--text` | `#f3eadb` cream |

- **Texture:** paper/felt grain (SVG noise).
- **Cables:** braided cloth cords, drawn as a tight dash pattern along the cable.
- **Feel:** cosy and distinctive. Less "techy" than A.

## Direction D: Punk

A photocopied punk zine or gig flyer. The "clean" directions turned up to loud: sharp lines, nothing rounded.

| Token | Value |
|---|---|
| `--bg` / canvas | `#0b0b0b` near-black with a faint halftone dot screen |
| `--tile` (node) | `#171717` |
| `--notes` | `#d4ff00` acid highlighter |
| `--instrument` / `--accent` | `#ff2e88` hot pink |
| `--filter` | `#ff6a00` safety orange |
| `--output` | `#00e5ff` electric cyan |
| `--text` | `#f4efe4` photocopy-paper white |
| type | Impact (poster face) for titles and labels |

- **Nodes:** square corners and a 2px black outline. A hard, unblurred offset shadow in the node colour, like a
  misprinted stencil. A **torn zig-zag bottom edge** and halftone plus xerox grain.
- **Labels:** eyebrows are slapped-on tape strips (node colour behind black text, tilted -2°). Titles are in a
  condensed poster face.
- **Cables:** square elbows instead of curves, so they look like straight cuts while each route stays easy to follow.
  Flat colour with a thick black outline and no shine.
- **Cat group:** a dashed "cut here" frame with hazard hatching, a tilted tape label, and sticker-style order badges.
- **Everything else** (top bar, buttons, sidebar chips, dropdowns) goes square with hard shadows.
- **Known limit:** the gooey Share morph still softens its corners a little, because the goo effect is a blur.
- **Feel:** loud and full of character. The risk is fatigue on big graphs; the hard shadows add a lot of edges.

## FX rack: what it changed in the real app (built 2026-11-10)

Built with no new op type: `addNode` with `type: "fx"`, and one `updateNodeData` `{ effects }` patch per change.
What it touched:

| Area | Change |
|---|---|
| `model/types.ts` | New `fx` node in the `GraphNode` union, with data like `{ effects: { id, kind, value, q?, on }[] }` |
| `model/graph.ts` | Connection rules (`VALID_TARGETS`): Instrument → FX, FX → Filter/FX/Output |
| `model/applyOp.ts` + Python `server/app` port | Validate `fx` nodes and their patches; mirror the tests in both suites |
| `model/compile.ts` | An FX node emits `.lpf(..).gain(..).delay(..).room(..)` for its rows that are on; bypassed rows are skipped |
| Ops | Either a whole-array `updateNodeData` patch (simple, but two people editing different rows at once means the last one wins), or row-level ops like `addEffect` / `updateEffect` / `removeEffect` (more work, merges cleanly) |
| "Combine into FX rack" | Ideally one new op that swaps a filter chain for a rack in a single change everyone sees at once |

Existing docs, ops and the starter fixture keep working, because the change only adds things.

## Accessibility

- Text stays on near-black node faces in every direction. The colour sits on edges, strips and handles, not
  behind body text.
- Colour is never the only signal. Node types keep their text labels and cat order keeps its numbers.
- Cables don't move. The only looping motion is the cat link's flowing dashes, and that already stops
  under `prefers-reduced-motion`.
- To check after picking a direction: contrast of `--muted` text on each `--tile`, and of the cat badge
  number on `--notes` (run `/design:accessibility-review`).

## Open questions

1. ~~Which direction?~~ Warm Analog was chosen. Punk is a newer wildcard to compare against it.
2. Should cables take the source colour only, or keep the gradient?
3. Do you want the colour on the sidebar palette chips too (each chip in its node colour)?
4. Should the Output node pulse to the beat while playing? This would be a new animation in the same family as Play's breathing.

## How a chosen direction ships

1. Move that direction's tokens from `web/src/mockups/mockups.css` into `:root` in `globals.css`.
2. Move its node, cable and frame rules into the node CSS files.
3. Register `CableEdge` as the default edge type in `EditorApp.tsx`.
4. Delete `web/src/mockups/` and `web/src/app/mockups/`.
