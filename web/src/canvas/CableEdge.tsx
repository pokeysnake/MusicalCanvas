import { getSmoothStepPath, type EdgeProps } from "@xyflow/react";

/**
 * A patch cable: one gentle curve that sags a little under "gravity" (never an S-wiggle, so the graph still
 * reads like a flow chart). Coloured as a gradient from the source node's colour to the target's.
 * Drawn in layers: dark shadow, coloured core, thin highlight. Themes restyle those layers in app/theme.css
 * (braided cloth in Warm Analog).
 * data: { from, to } are CSS colours, e.g. "var(--notes)"; shape "sharp" draws square elbows instead (kept for a possible future theme).
 */
export default function CableEdge({
    id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected,
}: EdgeProps) {
    const from = String(data?.from ?? "var(--text)");
    const to = String(data?.to ?? from);

    let d: string;
    if (data?.shape === "sharp") {
        // punk: straight runs with hard 90° corners (still one clear route per cable, easy to follow)
        [d] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 0, offset: 24 });
    } else {
        const length = Math.hypot(targetX - sourceX, targetY - sourceY);
        const reach = Math.max(60, Math.abs(targetX - sourceX) * 0.5); // how far the cable leaves each jack horizontally
        const sag = Math.min(40, length * 0.12);                        // how much it droops in the middle
        d = `M ${sourceX},${sourceY} C ${sourceX + reach},${sourceY + sag} ${targetX - reach},${targetY + sag} ${targetX},${targetY}`;
    }
    const gradientId = "cable-" + id.replace(/[^a-zA-Z0-9-]/g, "_");

    return (
        <g className={"cable" + (selected ? " is-selected" : "")}>
            <defs>
                <linearGradient id={gradientId} gradientUnits="userSpaceOnUse"
                    x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
                    {/* style (not the stop-color attribute) so CSS variables work */}
                    <stop offset="0" style={{ stopColor: from }} />
                    <stop offset="1" style={{ stopColor: to }} />
                </linearGradient>
            </defs>
            <path className="cable__shadow" d={d} />
            <path className="cable__core" d={d} stroke={`url(#${gradientId})`} />
            <path className="cable__sheen" d={d} />
            {/* plug caps over the jacks */}
            <rect className="cable__plug" x={sourceX} y={sourceY - 4} width={9} height={8} rx={2} style={{ fill: from }} />
            <rect className="cable__plug" x={targetX - 9} y={targetY - 4} width={9} height={8} rx={2} style={{ fill: to }} />
            {/* wide invisible path so the cable is easy to click/select */}
            <path className="react-flow__edge-interaction" d={d} fill="none" strokeOpacity={0} strokeWidth={20} />
        </g>
    );
}
