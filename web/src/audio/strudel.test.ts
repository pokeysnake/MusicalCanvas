import { beforeEach, describe, expect, it, vi } from "vitest";

/* a fake @strudel/web where the test decides when initStrudel finishes, so the timing bugs can be reproduced */
let finishInit: () => void = () => {};
const fake = {
  initStrudel: vi.fn(() => new Promise<void>((resolve) => { finishInit = resolve; })),
  evaluate: vi.fn<(code: string) => Promise<void>>(async () => {}),
  hush: vi.fn(),
  samples: vi.fn(async () => {}),
  getSuperdoughAudioController: () => ({ output: { destinationGain: null } }),
};
vi.mock("@strudel/web", () => fake);

// strudel.ts keeps module state (ready, generation), so each test gets a fresh copy
async function freshAudio() {
  vi.resetModules();
  return import("./strudel");
}

beforeEach(() => vi.clearAllMocks());

describe("audio/strudel", () => {
  it("Stop pressed while the first Play is still loading wins: nothing is evaluated", async () => {
    const audio = await freshAudio();
    const playing = audio.play("note(\"c4\")");
    await vi.waitFor(() => expect(fake.initStrudel).toHaveBeenCalled());
    await audio.stop();
    finishInit();
    await playing;
    expect(fake.evaluate).not.toHaveBeenCalled();
  });

  it("a Play after that Stop still plays", async () => {
    const audio = await freshAudio();
    const first = audio.play("a");
    await vi.waitFor(() => expect(fake.initStrudel).toHaveBeenCalled());
    await audio.stop();
    finishInit();
    await first;
    await audio.play("b");
    expect(fake.evaluate).toHaveBeenCalledExactlyOnceWith("b");
  });

  it("new code during the load is still evaluated (only Stop cancels)", async () => {
    const audio = await freshAudio();
    const first = audio.play("a");
    await vi.waitFor(() => expect(fake.initStrudel).toHaveBeenCalled());
    const second = audio.play("b");
    finishInit();
    await Promise.all([first, second]);
    expect(fake.evaluate.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
  });

  it("Stop before Strudel was ever started does nothing instead of throwing", async () => {
    const audio = await freshAudio();
    await expect(audio.stop()).resolves.toBeUndefined();
    expect(fake.hush).not.toHaveBeenCalled();
  });
});
