declare module "@strudel/web" {
  export function initStrudel(options?: Record<string, unknown>): Promise<unknown> | unknown;
  export function evaluate(code: string, autoplay?: boolean): Promise<unknown>;
  export function hush(): void;
  /** registers a sample map (URL to a strudel JSON, or an object); its _base is used when baseUrl is omitted */
  export function samples(sampleMap: string | Record<string, unknown>, baseUrl?: string): Promise<void>;
  /** the one audio graph everything plays through; destinationGain is the master gain before the speakers */
  export function getSuperdoughAudioController(): { output: { destinationGain: GainNode | null } };
}

declare module "@strudel/mini" {
  export type MiniPos = { offset: number; line: number; column: number };
  export type MiniLocation = { start: MiniPos; end: MiniPos };

  export type MiniAtom = { type_: "atom"; source_: string; location_: MiniLocation };
  export type MiniElement = {
    type_: "element";
    source_: MiniNode;
    options_: { ops: { type_: string; arguments_: Record<string, unknown> }[]; weight: number; reps: number };
    location_: MiniLocation;
  };
  export type MiniPattern = {
    type_: "pattern";
    source_: MiniNode[];
    arguments_: { alignment: string; _steps?: boolean; seed?: number };
  };
  export type MiniNode = MiniAtom | MiniElement | MiniPattern;

  export function mini2ast(code: string): MiniNode;
  export function getLeaves(code: string): MiniAtom[];
  export function parse(code: string): MiniNode;
  export class SyntaxError extends Error {
    location: MiniLocation;
    expected: unknown;
    found: string | null;
  }
}