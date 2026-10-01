"use client";
import { Handle, Position } from "@xyflow/react";
import "./output-node.css";

export default function OutputNode() {
    return (
        <div className="output-node">
            <Handle type="target" position={Position.Left} />
            {/* ICON */}
            <div className="output-node__icon" aria-hidden="true">
                <svg width="17" height="17" viewBox="0 0 22 22" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9v4h4l5 4V5L7 9z" />
                    <path d="M15 8c1.5 1.5 1.5 4.5 0 6" />
                    <path d="M18 5c3 3 3 9 0 12" />
                </svg>
            </div>

            {/* TITLE */}
            <div className="output-node__titles">
                <span className="output-node__eyebrow">Output</span>
                <span className="output-node__title">Speakers</span>
            </div>

            {/* Level meter static until later */}
            <div className="output-node__meter" aria-hidden="true">
                <span className="output-node__bar" style={{height:12}}/>
                <span className="output-node__bar" style={{height:22}}/>
                <span className="output-node__bar" style={{height:16}}/>
                <span className="output-node__bar output-node__bar--peak" style={{height:26}}/>
            </div>
        </div>
    );
}