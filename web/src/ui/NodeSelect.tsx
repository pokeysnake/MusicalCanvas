"use client";
import { ChevronDown } from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePortalRoot } from "./portalRoot";
import "./node-select.css";

export type SelectOption = { value: string; label: string; group?: string; hint?: string };

/**
 * A themed replacement for a native <select> on a node (the browser's own menu is always white).
 * shadcn DropdownMenu (Radix) with radio items: the current value is ticked, arrow keys + Enter work.
 * Options with a `group` are shown under that heading, in the order the groups first appear.
 * `color` tints the heading and the tick, e.g. "var(--instrument)".
 */
export default function NodeSelect({ value, options, onChange, label, color, className }: {
    value: string;
    options: readonly SelectOption[];
    onChange: (value: string) => void;
    label: string;     // aria label, e.g. "Sound"
    color: string;
    className: string; // the trigger's look (it replaces the old <select>, so it reuses that class)
}) {
    const root = usePortalRoot();
    const current = options.find((o) => o.value === value);

    // group options, keeping first-seen order
    const groups: { name: string | undefined; items: SelectOption[] }[] = [];
    for (const o of options) {
        const g = groups.find((x) => x.name === o.group);
        if (g) g.items.push(o); else groups.push({ name: o.group, items: [o] });
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className={className + " node-select__trigger nodrag"} aria-label={label}>
                <span>{current?.label ?? value}</span>
                <ChevronDown size={13} className="node-select__chevron" />
            </DropdownMenuTrigger>
            <DropdownMenuContent container={root} align="start" className="node-select" style={{ "--nc": color } as React.CSSProperties}>
                <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
                    {groups.map((g, i) => (
                        <div key={g.name ?? i}>
                            {i > 0 && <DropdownMenuSeparator />}
                            {g.name && <DropdownMenuLabel className="node-select__group">{g.name}</DropdownMenuLabel>}
                            {g.items.map((o) => (
                                <DropdownMenuRadioItem key={o.value} value={o.value} className="node-select__item">
                                    <span className="node-select__name">{o.label}</span>
                                    {o.hint && <span className="node-select__hint">{o.hint}</span>}
                                </DropdownMenuRadioItem>
                            ))}
                        </div>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
