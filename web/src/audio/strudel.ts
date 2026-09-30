// Thin wrapper around @strudel/web. Audio may only start after a user gesture,
// so initStrudel() is called lazily from the Play button.
let ready: Promise<void> | null = null;

async function load() {
  return import("@strudel/web");
}

export async function play(code: string): Promise<void> {
  const s = await load();
  if (!ready) {
    ready = Promise.resolve(s.initStrudel())
      .then(() => undefined)
      .catch((e) => {
        ready = null; // let the next Play retry instead of caching the failure
        throw e;
      });
  }
  await ready;
  await s.evaluate(code);
}

export async function stop(): Promise<void> {
  const s = await load();
  s.hush();
}
