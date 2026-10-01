import type { Doc } from "./types";
export const OUTPUT_ID = "output";

/**
 *  Function instead of a const
 *  - each call returns a fresh object
 *      if it were one shared constant, a test that accidentall modified it would break every other test
 */
export function emptyDoc(): Doc {
    return {
        nodes: {
            [OUTPUT_ID]: {id : OUTPUT_ID, type: "output", position: {x: 800, y:200}, data: {}},
        },
        edges: {},
        settings: {bpm:120, eq: { low: 0, mid: 0, high: 0} },
    };
}

