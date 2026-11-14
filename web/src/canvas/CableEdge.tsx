import type { EdgeProps } from "@xyflow/react";

const ARROW = 8;     // arrowhead length; the line stops where the arrowhead starts
const BUS_GAP = 22;  // how far left of a shared input the wires meet
const DETOUR = 18;   // how far a backwards wire sticks out before turning

/**
 * Where a wire runs, as an SVG path of straight runs and right-angle corners (a schematic, not a curve).
 * (sx, sy) is the output pin, (tx, ty) the input pin. Returns the path and the junction point, if any.
 *
 *  - bus: the input takes 2+ wires. They all turn down/up at the same x, just left of the input, so they
 *    merge into one line going in, with a dot where they join (like a bus on a circuit diagram).
 *  - otherwise the wire turns halfway between the two pins.
 *  - backwards (input left of the output): out a little, across between the two rows, and back in.
 */
export function wirePath(sx: number, sy: number, tx: number, ty: number, bus: boolean) {
    const end = tx - ARROW;
    if (Math.abs(sy - ty) < 1 && sx < end) return { d: `M ${sx},${sy} H ${end}`, junction: null };

    const turnX = bus ? tx - BUS_GAP : Math.round((sx + end) / 2);
    if (sx + 4 < turnX) {
        return { d: `M ${sx},${sy} H ${turnX} V ${ty} H ${end}`, junction: bus ? { x: turnX, y: ty } : null };
    }
    const midY = Math.round((sy + ty) / 2);
    const inX = bus ? tx - BUS_GAP : tx - DETOUR;
    return { d: `M ${sx},${sy} H ${sx + DETOUR} V ${midY} H ${inX} V ${ty} H ${end}`, junction: bus ? { x: inX, y: ty } : null };
}

/**
 * A wire on the drawing: one inked line with an arrowhead into the input. Styles live in app/theme.css:
 * it draws itself in when it first appears, turns red when selected, and while the song plays a red pulse
 * runs along it once per beat (.wire__flow).
 * data: { bus } is true when the target has 2+ inputs (set in canvas/flow.ts).
 */
export default function CableEdge({ sourceX, sourceY, targetX, targetY, data, selected }: EdgeProps) {
    const { d, junction } = wirePath(sourceX, sourceY, targetX, targetY, Boolean(data?.bus));
    const arrow = `M ${targetX - ARROW},${targetY - 4} L ${targetX},${targetY} L ${targetX - ARROW},${targetY + 4} Z`;

    return (
        <g className={"wire" + (selected ? " is-selected" : "")}>
            <path className="wire__line" d={d} pathLength={1} />
            <path className="wire__flow" d={d} />
            <path className="wire__arrow" d={arrow} />
            {junction && <circle className="wire__dot" cx={junction.x} cy={junction.y} r={3.5} />}
            {/* wide invisible path so the wire is easy to click/select */}
            <path className="react-flow__edge-interaction" d={d} fill="none" strokeOpacity={0} strokeWidth={20} />
        </g>
    );
}
