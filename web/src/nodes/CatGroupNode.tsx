import type { NodeProps } from "@xyflow/react";
import { ChevronDown, GripVertical } from "lucide-react";
import type { Box } from "@/canvas/sequence";
import "./cat-group-node.css";

/**
 * The frame drawn behind a cat sequence (2+ Notes wired into one Instrument). It isn't in the Doc. Only its
 * label tab is grabbable (drags the whole group); the rest is click-through. Between each pair of Notes, in play order,
 * an animated dashed link with a small arrow shows "this one, then that one".
 * data: { label, members } from catGroups(); member boxes are relative to this frame.
 */
export default function CatGroupNode({ data }: NodeProps) {
    const label = String(data.label ?? "");
    const members = (data.members ?? []) as Box[];

    // from the bottom-middle of each Notes to the top-middle of the next one
    const links = members.slice(1).map((b, i) => {
        const a = members[i];
        const x1 = a.x + a.width / 2, y1 = a.y + a.height;
        const x2 = b.x + b.width / 2, y2 = b.y;
        // the arrow points along the link (0deg = straight down)
        const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI - 90;
        return { x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2, angle };
    });

    return (
        <div className="cat-group">
            {/* drag handle: grabbing the tab moves every Notes in the group (see EditorApp onNodesChange) */}
            <span className="cat-group__tab" title="Drag to move the whole group">
                <GripVertical size={12} /> {label} · plays in order
            </span>
            <svg className="cat-group__links" aria-hidden="true">
                {links.map((l, i) => <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />)}
            </svg>
            {links.map((l, i) => (
                <span key={i} className="cat-group__then" style={{ left: l.mx, top: l.my }}>
                    <ChevronDown size={12} strokeWidth={2.5} style={{ transform: `rotate(${l.angle}deg)` }} />
                </span>
            ))}
        </div>
    );
}
