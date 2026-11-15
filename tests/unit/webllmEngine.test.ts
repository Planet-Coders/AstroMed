import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { create, hasModelInCache } = vi.hoisted(() => ({
  create: vi.fn(),
  hasModelInCache: vi.fn(async () => true),
}));
vi.mock("@mlc-ai/web-llm", () => ({
  CreateWebWorkerMLCEngine: create,
  hasModelInCache,
  prebuiltAppConfig: { model_list: [{
    model_id: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    model: "https://models.example/compact/",
    model_lib: "https://models.example/compact.wasm",
    required_features: ["shader-f16"],
  }] },
}));

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
  vi.stubEnv("NEXT_PUBLIC_WEBLLM_ASSET_BASE", "");
  workers = [];
  storage = new Map();
  vi.stubGlobal("window", { isSecureContext: true, location: { origin: "http://localhost:3000" } });
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
  const engine = await preloadEngine();
  expect(engine).toBe(getEngine());
  expect(engine?.chat.completions.create).not.toHaveBeenCalled();
  expect(create.mock.calls.map(call => call[1])).toEqual([small]);
  expect(hasModelInCache).toHaveBeenCalledWith(small, undefined);
});

it("uses the mirror for the cache check and the worker while keeping a pinned compact model's context small", async () => {
  vi.stubEnv("NEXT_PUBLIC_WEBLLM_MODEL", small);
  vi.stubEnv("NEXT_PUBLIC_WEBLLM_ASSET_BASE", "/copilot-models");
  const { preloadEngine, getEngine } = await import("@/lib/webllm/engine");
  expect(await preloadEngine()).toBe(getEngine());

  const [, model, engineConfig, chatOptions] = create.mock.lastCall!;
  const directory = `http://localhost:3000/copilot-models/${small}/`;
  expect(model).toBe(small);
  expect(engineConfig.appConfig.model_list).toEqual([{
    model_id: small,
    model: directory + "resolve/main/",
    model_lib: directory + "model.wasm",
    required_features: ["shader-f16"],
  }]);
  expect(hasModelInCache).toHaveBeenCalledWith(small, engineConfig.appConfig);
  expect(chatOptions).toEqual({ context_window_size: 1024 });
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
  const { preloadEngine, discardEngine, runtimeFailure } = await import("@/lib/webllm/engine");
  const original = (await preloadEngine())!;
  const failure = runtimeFailure(new Error("OperationError: A valid external Instance reference no longer exists."));
  expect(failure).toBe("gpu");
  discardEngine(original, failure!);
  expect(await preloadEngine()).toBeNull();
  expect(create).toHaveBeenCalledTimes(1);
  await preloadEngine(true);
  expect(create.mock.calls.map(call => call[1])).toEqual([llama, llama]);
  expect(storage.size).toBe(0);
});

it("cancels model startup when switching to Basic mode and permits a later start", async () => {
  create.mockImplementationOnce(() => new Promise(() => {}));
  const { preloadEngine, stopOnDeviceAI, getEngine } = await import("@/lib/webllm/engine");
  const starting = preloadEngine();
  await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  stopOnDeviceAI();
  expect(await starting).toBeNull();
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  expect(getEngine()).toBeNull();
  expect(await preloadEngine()).not.toBeNull();
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
