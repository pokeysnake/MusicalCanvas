/** compiler --> Doc --> strudel code */
import type { Doc, GraphNode } from "./types";
import { nodesReachingOutput } from "./graph";
import { parseNotes } from "./notes";
import { getSound } from "./sounds";
import { OUTPUT_ID } from "./doc";
import { FILTERS, type FilterKind } from "./filters";

export type CompileIssue = { nodeId: string; message: string };
export type CompileResult = { code: string; issues: CompileIssue[] };

type InstrumentNode = Extract<GraphNode, {type:"instrument"}>;
type FilterNode = Extract<GraphNode, { type: "filter" }>

//top to bottom by canvas y; ties broken id so the output never depends on insertion order
function byPosition(a:GraphNode, b:GraphNode): number {
    if(a.position.y !== b.position.y) return a.position.y - b.position.y;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function compile(doc:Doc): CompileResult {
    const nodes = Object.values(doc.nodes);
    const edges = Object.values(doc.edges);
    const issues = new Map<string, string>(); //nodeId --> message a map so each node is reported once

    /** SETUP */
    //only nodes with a path to the output can be heard
    const live = nodesReachingOutput(nodes,edges);

    //each live node's inputs, sorted top to bottom and how many live nodes read each node
    const inputs = new Map<string, GraphNode[]>();
    const uses = new Map<string, number>();

    for(const e of edges) {
        const src = doc.nodes[e.source];
        if(!src || !live.has(e.target)) continue;
        const list = inputs.get(e.target) ?? [];
        list.push(src);
        inputs.set(e.target, list);
        uses.set(e.source, (uses.get(e.source) ?? 0) + 1);
    }

    for (const list of inputs.values()) list.sort(byPosition);
    const inputsOf = (id:string) => inputs.get(id) ?? [];

    //mute always wins --> once any live instrument is soloed only soloed ones play
    const anySolo = nodes.some((n) => n.type === "instrument" && n.data.solo && live.has(n.id));
    const plays = (n: InstrumentNode) => !n.data.muted && (!anySolo || n.data.solo);

    /** INSTRUMENTS */
    //a JS string literal: JSON.stringify adds the quotes and escapes anything that would brak out of them
    const str = (s:string) => JSON.stringify(s);
    //one part played as is, 2+ played per cycle
    const catOf = (parts: string[]) => (parts.length === 1 ? parts[0] : `cat(${parts.join(", ")})`);

    //an instrument notes texts top to bottom, bad ones are reported and skipped, blanks skipped too
    function notesTexts(id:string) :string[] {
        const texts: string[] = [];
        for(const n of inputsOf(id)) {
            if(n.type !== "notes") continue;
            const parsed = parseNotes(n.data.text);
            if(!parsed.ok) issues.set(n.id, `${n.data.name}: ${parsed.message}`);
            else if (parsed.steps.length > 0) texts.push(n.data.text);
        }
        return texts;
    }

    function instrumentExpr(node: InstrumentNode): string | null {
        if(!plays(node)) return null;
        const sound = getSound(node.data.sound);
        if(!sound) {
            issues.set(node.id, `unknown sound: ${node.data.sound}`);
            return null;
        }
        const texts = notesTexts(node.id);
        if(texts.length === 0) return null;

        const { s, bank, n} = sound.strudel;
        const extras = (bank ? `.bank(${str(bank)})` : "") + (n !== undefined ? `.n(${n})` : "");
        if (sound.kind === "pitched") return `${catOf(texts.map((t) => `note(${str(t)})`))}.s(${str(s)})${extras}`;
        return `s(${str(s)})${extras}.struct(${catOf(texts.map(str))})`;
    }

    /** Filters and Output */
    // Strudel's name for each filter's Q (resonance); filters not listed have no Q
    const Q_PARAM: Partial<Record<FilterKind, string>> = { lpf: "lpq", hpf: "hpq", bpf: "bpq" };

    // one part as is, 2+ played at the same time
    const stackOf = (parts: string[]) => (parts.length === 1 ? parts[0] : `stack(${parts.join(", ")})`);

    // the code for every input that has something to play
    const inputExprs = (id: string) =>
        inputsOf(id).map(exprOf).filter((e): e is string => e !== null);

    function filterExpr(node: FilterNode): string | null {
        const { kind, value, q } = node.data;
        if (!Object.hasOwn(FILTERS, kind)) {
            issues.set(node.id, `unknown filter: ${kind}`);
            return null;
        }
        const parts = inputExprs(node.id);
        if (parts.length === 0) return null;
        const qParam = Q_PARAM[kind];
        return `${stackOf(parts)}.${kind}(${value})` + (qParam ? `.${qParam}(${q})` : "");
    }

    // build a node's code from scratch (null = nothing to play); Notes are read by their instrument
    function buildExpr(node: GraphNode): string | null {
        switch (node.type) {
            case "instrument": return instrumentExpr(node);
            case "filter":     return filterExpr(node);
            default:           return null;
        }
    }

    /** shared nodes become variables */
    const vars: string[] = [];                      // "const v1 = ..." lines, in the order they're needed
    const done = new Map<string, string | null>();  // node id -> its code or variable name, so each node is built once

    function exprOf(node: GraphNode): string | null {
        if (done.has(node.id)) return done.get(node.id) ?? null;
        let expr = buildExpr(node);
        if (expr !== null && (uses.get(node.id) ?? 0) >= 2) {
            const name = `v${vars.length + 1}`;
            vars.push(`const ${name} = ${expr}`);
            expr = name;
        }
        done.set(node.id, expr);
        return expr;
    }

    const parts = inputExprs(OUTPUT_ID);
    const body = parts.length > 0 ? stackOf(parts) : "silence";
    const code = [`setcpm(${doc.settings.bpm}/4)`, ...vars, body].join("\n");
    return { code, issues: [...issues].map(([nodeId, message]) => ({ nodeId, message })) };

}

