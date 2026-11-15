"use client";

import { useSyncExternalStore } from "react";
import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import { COPILOT_SYSTEM_PROMPT } from "@/lib/copilotPrompt";

/**
 * Model weights are cached by WebLLM in the browser Cache API, so only the very first
 * visit downloads them. Override with NEXT_PUBLIC_WEBLLM_MODEL to pin one model.
 */
const PINNED_MODEL = process.env.NEXT_PUBLIC_WEBLLM_MODEL || null;
const LOAD_STALL_MS = 120_000;
const CONTEXT_WINDOW = 1536;
const COMPACT_PREFERENCE = "astromed_copilot_compact";

/**
 * Models to try, best first. GPUs without the `shader-f16` feature (common on older
 * Intel/AMD integrated graphics) need the f32 builds; the small SmolLM2 model is the
 * fallback when the larger one cannot fit in GPU memory.
 */
function preferCompact() {
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  try {
    return mobile || (memory != null && memory <= 4) || localStorage.getItem(COMPACT_PREFERENCE) === "1";
  } catch {
    return mobile || (memory != null && memory <= 4);
  }
}

function rememberCompact() {
  if (PINNED_MODEL) return;
  try {
    localStorage.setItem(COMPACT_PREFERENCE, "1");
  } catch {
    /* Storage may be unavailable. The current retry still uses the compact model. */
  }
}

function candidateModels(hasF16: boolean, compact: boolean): string[] {
  if (PINNED_MODEL) return [PINNED_MODEL];
  const quantization = hasF16 ? "q4f16_1" : "q4f32_1";
  const small = `SmolLM2-360M-Instruct-${quantization}-MLC`;
  return compact ? [small] : [`Llama-3.2-1B-Instruct-${quantization}-MLC`, small];
}

export const WEBLLM_MODEL_ID = PINNED_MODEL ?? "Llama-3.2-1B-Instruct-q4f16_1-MLC";
export const CAN_CHOOSE_COMPACT = !PINNED_MODEL;

/** "basic" = no usable WebGPU (or every model failed): the rule-based triage answers. */
export type EngineStatus = "idle" | "loading" | "ready" | "basic";

export type EngineState = {
  status: EngineStatus;
  /** 0..1 while loading, null when unknown. */
  progress: number | null;
  text: string;
  /** Why the co-pilot is in basic mode, in plain words. */
  reason: string | null;
  /** The model actually loaded (may be a smaller fallback). */
  model: string | null;
};

const IDLE: EngineState = {
  status: "idle",
  progress: null,
  text: "",
  reason: null,
  model: null,
};

// Module-level singleton: survives client-side navigation and React remounts,
// so the model loads once per tab instead of once per mount.
let state: EngineState = IDLE;
type LoadedEngine = {
  engine: MLCEngineInterface;
  stopped: Promise<null>;
  retire: () => void;
};
let loaded: LoadedEngine | null = null;
let loading: Promise<MLCEngineInterface | null> | null = null;
let recoveryUsed = false;
let useCompactAfterFailure = false;
const listeners = new Set<() => void>();

function setState(patch: Partial<EngineState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getEngine(): MLCEngineInterface | null {
  return loaded?.engine ?? null;
}

/** A worker can stop while a request is waiting for its next stream chunk. */
export function engineStopped(engine: MLCEngineInterface): Promise<null> {
  return loaded?.engine === engine ? loaded.stopped : Promise.resolve(null);
}

export type RuntimeFailure = "gpu" | "worker" | "stalled";

const FAILURE_MESSAGE: Record<RuntimeFailure, string> = {
  gpu: "WebGPU stopped while running the on-device model.",
  worker: "The on-device AI worker stopped responding.",
  stalled: "The on-device model stopped responding.",
};

export function runtimeFailure(error: unknown): RuntimeFailure | null {
  const message = String(error);
  if (/device.?lost|device (?:was )?lost|device has been lost|already been disposed|out of memory|compatible GPU|GPU validation|shader-f16|WebGPU is not available/i.test(message)) return "gpu";
  if (/model (?:is )?not loaded|ModelNotLoadedError|AI worker stopped/i.test(message)) return "worker";
  return null;
}

/** Retire a broken worker and try one fresh runtime before staying in Basic mode. */
export function discardEngine(engine: MLCEngineInterface, failure: RuntimeFailure) {
  if (loaded?.engine !== engine) return;
  loaded.retire();
  loaded = null;
  const reason = FAILURE_MESSAGE[failure];
  if (recoveryUsed) {
    loading = Promise.resolve(enterBasicMode(reason + " Retry the model, or reload the page if the browser keeps losing its GPU."));
    return;
  }
  recoveryUsed = true;
  useCompactAfterFailure = true;
  rememberCompact();
  loading = load(reason + " Restarting on-device AI…");
}

/** Short model name for UI chips, e.g. "LLAMA-3.2-1B-Q4". */
export function modelLabel(id: string | null) {
  if (!id) return "RULES ENGINE";
  return id
    .replace(/-MLC$/, "")
    .replace(/-Instruct/, "")
    .replace(/-q(\d)f\d+_\d$/, "-Q$1")
    .toUpperCase();
}

type GpuAdapter = { features: { has(name: string): boolean } };
type GpuLike = { requestAdapter(opts?: { powerPreference?: string }): Promise<GpuAdapter | null> };

/** Resolve the WebGPU adapter, or a plain-language reason why there is none. */
async function probeGpu(): Promise<{ adapter: GpuAdapter } | { reason: string }> {
  if (!window.isSecureContext) {
    return { reason: "WebGPU needs a secure page (https or localhost)." };
  }
  const gpu = (navigator as Navigator & { gpu?: GpuLike }).gpu;
  if (!gpu) {
    return { reason: "This browser does not expose WebGPU. Try an up-to-date Chrome, Edge, or Safari on a supported device." };
  }
  try {
    const adapter =
      (await gpu.requestAdapter({ powerPreference: "high-performance" }).catch(() => null)) ??
      (await gpu.requestAdapter());
    if (!adapter) {
      return { reason: "The browser could not get a usable WebGPU adapter. Check graphics acceleration or restart the browser." };
    }
    return { adapter };
  } catch {
    return { reason: "The GPU could not be initialised for WebGPU." };
  }
}

function enterBasicMode(reason: string) {
  setState({ status: "basic", progress: null, text: "", reason, model: null });
  return null;
}

async function load(text = "Checking WebGPU…"): Promise<MLCEngineInterface | null> {
  setState({ status: "loading", progress: null, reason: null, text, model: null });

  const probe = await probeGpu();
  if ("reason" in probe) return enterBasicMode(probe.reason);

  // Ask the browser not to evict the cached weights under storage pressure.
  void navigator.storage?.persist?.().catch(() => false);

  let webllm: typeof import("@mlc-ai/web-llm");
  try {
    webllm = await import("@mlc-ai/web-llm");
  } catch {
    return enterBasicMode("The on-device AI library could not be loaded.");
  }

  const models = candidateModels(probe.adapter.features.has("shader-f16"), useCompactAfterFailure || preferCompact());
  let failure = "The on-device model could not start. Retry the model to run its startup checks again.";
  for (const model of models) {
    const compact = model.startsWith("SmolLM2-360M");
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let worker: Worker | undefined;
    let installedEngine: MLCEngineInterface | undefined;
    let warming = false;
    try {
      const cached = await webllm.hasModelInCache(model).catch(() => false);
      setState({
        model,
        progress: 0,
        text: cached
          ? `Loading cached ${compact ? "compact " : ""}model files…`
          : `Downloading ${compact ? "compact " : ""}model files…`,
      });

      const candidate = worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      let rejectLoad: (reason: Error) => void = () => {};
      const loadFailed = new Promise<never>((_, reject) => { rejectLoad = reject; });
      const workerFailed = () => {
        if (installedEngine) discardEngine(installedEngine, "worker");
        else rejectLoad(new Error("The AI worker stopped during startup."));
      };
      const restartTimer = () => {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(() => rejectLoad(new Error("Model load stopped making progress")), LOAD_STALL_MS);
      };
      candidate.addEventListener("error", workerFailed);
      candidate.addEventListener("messageerror", workerFailed);
      restartTimer();
      let lastProgress = -1;
      let lastReport = "";
      const e = await Promise.race([webllm.CreateWebWorkerMLCEngine(candidate, model, {
        initProgressCallback: (report) => {
          if (worker !== candidate || installedEngine) return;
          if (report.progress !== lastProgress || report.text !== lastReport) {
            restartTimer();
            lastProgress = report.progress;
            lastReport = report.text;
          }
          if (report.progress < 1) setState({ progress: report.progress });
          else setState({ progress: null, text: "Model files loaded. Starting WebGPU…" });
        },
      }, PINNED_MODEL ? undefined : { context_window_size: CONTEXT_WINDOW }), loadFailed]);

      // Preflight a realistic prompt so a device that cannot sustain prefill can try a smaller model.
      warming = true;
      setState({ progress: null, text: "Testing the model on your GPU…" });
      restartTimer();
      await Promise.race([
        e.chat.completions.create({
          messages: [
            { role: "system", content: COPILOT_SYSTEM_PROMPT + "\n\nExample preflight. No crew readings or research are available." },
            { role: "user", content: "Say that data is unavailable." },
          ],
          max_tokens: 4,
        }).then(() => e.resetChat()),
        loadFailed,
      ]);

      let notifyStopped!: (value: null) => void;
      const stopped = new Promise<null>((resolve) => { notifyStopped = resolve; });
      installedEngine = e;
      loaded = {
        engine: e, stopped,
        retire: () => {
          candidate.terminate();
          notifyStopped(null);
        },
      };
      setState({ status: "ready", text: "On-device inference active" });
      return e;
    } catch (err) {
      console.warn(`WebLLM: ${model} failed to load`, err);
      worker?.terminate();
      worker = undefined;
      const runtime = runtimeFailure(err);
      if (runtime === "gpu" || warming) {
        if (!compact) {
          useCompactAfterFailure = true;
          rememberCompact();
        }
        failure = "The browser could not initialize or run the model on its GPU. Restart the browser and retry.";
      } else if (/fetch|network|Cache.*Request failed|HTTP|quota/i.test(String(err))) {
        failure = "The browser could not fetch or store the model files. Check the connection and available browser storage, then retry.";
      } else if (/stopped making progress/i.test(String(err))) {
        failure = "Model startup stopped making progress. Retry to reuse model files already cached by this browser.";
      }
    } finally {
      clearTimeout(stallTimer);
    }
  }
  return enterBasicMode(failure);
}

/** Start (or join) the model load. Safe to call from any page, any number of times. */
export function preloadEngine(force = false): Promise<MLCEngineInterface | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (force && state.status === "basic") {
    recoveryUsed = false;
    loading = null;
  }
  loading ??= load();
  return loading;
}

export function startCompactEngine() {
  if (PINNED_MODEL || state.status === "loading" || state.model?.startsWith("SmolLM2-360M")) return;
  useCompactAfterFailure = true;
  rememberCompact();
  loaded?.retire();
  loaded = null;
  recoveryUsed = false;
  loading = load("Starting the compact model…");
}

export function useWebLLM(): EngineState {
  return useSyncExternalStore(subscribe, () => state, () => IDLE);
}
