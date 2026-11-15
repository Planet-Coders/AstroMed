import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { create, hasModelInCache } = vi.hoisted(() => ({
  create: vi.fn(),
  hasModelInCache: vi.fn(async () => true),
}));
vi.mock("@mlc-ai/web-llm", () => ({ CreateWebWorkerMLCEngine: create, hasModelInCache }));

let workers: FakeWorker[];
let storage: Map<string, string>;

class FakeWorker extends EventTarget {
  terminate = vi.fn();
  constructor() {
    super();
    workers.push(this);
  }
}

const small = "SmolLM2-360M-Instruct-q4f16_1-MLC";
const llama = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const adapter = { features: { has: () => true } };

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_WEBLLM_MODEL", "");
  workers = [];
  storage = new Map();
  vi.stubGlobal("window", { isSecureContext: true });
  vi.stubGlobal("navigator", { userAgent: "Desktop browser", gpu: { requestAdapter: vi.fn(async () => adapter) } });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal("Worker", FakeWorker);
  create.mockImplementation(async () => ({
    chat: { completions: { create: vi.fn(async () => ({})) } },
    resetChat: vi.fn(async () => {}),
  }));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("starts a compact model on an iPhone that exposes WebGPU", async () => {
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone) Safari/605.1.15", gpu: { requestAdapter: async () => adapter } });
  const { preloadEngine, getEngine } = await import("@/lib/webllm/engine");
  expect(await preloadEngine()).toBe(getEngine());
  expect(create.mock.calls.map(call => call[1])).toEqual([small]);
});

it("restarts a broken worker once with the compact model and remembers that choice", async () => {
  const { preloadEngine, engineStopped, getEngine } = await import("@/lib/webllm/engine");
  const original = (await preloadEngine())!;
  const stopped = engineStopped(original);
  workers[0].dispatchEvent(new Event("error"));
  expect(await stopped).toBeNull();
  const recovered = await preloadEngine();
  expect(recovered).toBe(getEngine());
  expect(recovered).not.toBe(original);
  expect(create.mock.calls.map(call => call[1])).toEqual([llama, small]);
  expect(workers[0].terminate).toHaveBeenCalledOnce();

  workers[1].dispatchEvent(new Event("messageerror"));
  expect(await preloadEngine()).toBeNull();
  expect(create).toHaveBeenCalledTimes(2);
  expect(await preloadEngine(true)).not.toBeNull();
  expect(create.mock.lastCall?.[1]).toBe(small);

  vi.resetModules();
  const reloaded = await import("@/lib/webllm/engine");
  await reloaded.preloadEngine();
  expect(create.mock.lastCall?.[1]).toBe(small);
});

it("keeps a pinned deployment model during runtime recovery", async () => {
  vi.stubEnv("NEXT_PUBLIC_WEBLLM_MODEL", llama);
  const { preloadEngine, discardEngine } = await import("@/lib/webllm/engine");
  const original = (await preloadEngine())!;
  discardEngine(original, "gpu");
  await preloadEngine();
  expect(create.mock.calls.map(call => call[1])).toEqual([llama, llama]);
  expect(storage.size).toBe(0);
});

it("switches a ready desktop worker to a fresh compact model when requested", async () => {
  const { preloadEngine, engineStopped, startCompactEngine } = await import("@/lib/webllm/engine");
  const original = (await preloadEngine())!;
  const retirement = engineStopped(original);
  startCompactEngine();
  expect(await retirement).toBeNull();
  expect(await preloadEngine()).not.toBe(original);
  expect(create.mock.calls.map(call => call[1])).toEqual([llama, small]);
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  expect(storage.size).toBe(1);
});
