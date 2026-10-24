// Thin wrapper around @strudel/web. Audio may only start after a user gesture,
// so initStrudel() is called lazily from the Play button.
let ready: Promise<void> | null = null;

// volume settings
let volume = 0.5; //0..1 the slider position

// master gain right before speakers; squared because loudness feels logarithmic,
// so the slider's middle sounds like "half" instead of nearly full
function applyVolume (s: typeof import("@strudel/web")) {
  const g = s.getSuperdoughAudioController().output.destinationGain;
  if(g) g.gain.value = volume * volume;
}

export async function  setVolume(v: number): Promise<void> {
  volume = v;
  if(!ready) return; //not init yet --> play() applies it after init
  const s = await load();
  applyVolume(s);
}

// initStrudel only registers the built-in synths; sample-based sounds (piano, drum machines)
// need their sample maps registered too. These are the same maps strudel.cc loads.
const DOUGH = "https://raw.githubusercontent.com/felixroos/dough-samples/main";

async function load() {
  return import("@strudel/web");
}

export async function play(code: string): Promise<void> {
  const s = await load();
  if (!ready) {
    ready = Promise.resolve(
      s.initStrudel({
        // runs after the synths are registered; only the JSON name lists download here,
        // each audio file is fetched the first time it plays
        prebake: () => Promise.all([
          s.samples(`${DOUGH}/piano.json`),
          s.samples(`${DOUGH}/tidal-drum-machines.json`),
        ]),
      }),
    )
      .then(() => undefined)
      .catch((e) => {
        ready = null; // let the next Play retry instead of caching the failure
        throw e;
      });
  }
  await ready;
  applyVolume(s); // the slider may have moved before the first Play
  await s.evaluate(code);
}

export async function stop(): Promise<void> {
  const s = await load();
  s.hush();
}
