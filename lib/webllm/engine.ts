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

/**
 * Models to try, best first. GPUs without the `shader-f16` feature (common on older
 * Intel/AMD integrated graphics) need the f32 builds; the small SmolLM2 model is the
 * fallback when the larger one cannot fit in GPU memory.
 */
function candidateModels(hasF16: boolean): string[] {
  if (PINNED_MODEL) return [PINNED_MODEL];
  return hasF16
    ? ["Llama-3.2-1B-Instruct-q4f16_1-MLC", "SmolLM2-360M-Instruct-q4f16_1-MLC"]
    : ["Llama-3.2-1B-Instruct-q4f32_1-MLC", "SmolLM2-360M-Instruct-q4f32_1-MLC"];
}

export const WEBLLM_MODEL_ID = PINNED_MODEL ?? "Llama-3.2-1B-Instruct-q4f16_1-MLC";

/** "basic" = no usable WebGPU (or every model failed): the rule-based triage answers. */
export type EngineStatus = "idle" | "loading" | "ready" | "basic";

export type EngineState = {
  status: EngineStatus;
  /** 0..1 while loading, null when unknown. */
  progress: number | null;
  text: string;
  /** Why the co-pilot is in basic mode, in plain words. */
  reason: string | null;
  /** Whether weights were already in the browser cache when loading began. */
  cached: boolean | null;
  /** The model actually loaded (may be a smaller fallback). */
  model: string | null;
};

const IDLE: EngineState = {
  status: "idle",
  progress: null,
  text: "",
  reason: null,
  cached: null,
  model: null,
};

// Module-level singleton: survives client-side navigation and React remounts,
// so the model loads once per tab instead of once per mount.
let state: EngineState = IDLE;
let engine: MLCEngineInterface | null = null;
let worker: Worker | null = null;
let loading: Promise<MLCEngineInterface | null> | null = null;
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
  return engine;
}

/** A timed-out worker cannot safely serve another completion. */
export function discardEngine(stalled: MLCEngineInterface, reason: string) {
  if (engine !== stalled) return;
  enterBasicMode(reason);
  loading = null;
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
    return { reason: "This browser has no WebGPU. Chrome or Edge 113+ on a supported GPU can run the full model." };
  }
  try {
    const adapter =
      (await gpu.requestAdapter({ powerPreference: "high-performance" })) ??
      (await gpu.requestAdapter());
    if (!adapter) {
      return { reason: "WebGPU is present but this computer's graphics driver doesn't expose a usable GPU." };
    }
    return { adapter };
  } catch {
    return { reason: "The GPU could not be initialised for WebGPU." };
  }
}

function enterBasicMode(reason: string) {
  worker?.terminate();
  worker = null;
  engine = null;
  setState({ status: "basic", progress: null, text: "", reason, model: null });
  return null;
}

async function load(): Promise<MLCEngineInterface | null> {
  setState({ status: "loading", progress: null, reason: null, text: "Checking WebGPU…" });

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

  const models = candidateModels(probe.adapter.features.has("shader-f16"));
  for (const [i, model] of models.entries()) {
    const fallback = i > 0;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const cached = await webllm.hasModelInCache(model).catch(() => false);
      setState({
        cached,
        model,
        progress: 0,
        text: `${fallback ? "Trying a smaller model. " : ""}${
          cached ? "Loading cached model into GPU…" : "Downloading model weights (first run only)…"
        }`,
      });

      const candidate = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      worker = candidate;
      let rejectLoad: (reason: Error) => void = () => {};
      const loadFailed = new Promise<never>((_, reject) => { rejectLoad = reject; });
      const restartTimer = () => {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(() => rejectLoad(new Error("Model load stopped making progress")), LOAD_STALL_MS);
      };
      candidate.addEventListener("error", () => rejectLoad(new Error("WebLLM worker failed to load")), { once: true });
      restartTimer();
      let lastProgress = -1;
      let lastReport = "";
      const e = await Promise.race([webllm.CreateWebWorkerMLCEngine(candidate, model, {
        initProgressCallback: (report) => {
          if (worker !== candidate) return;
          if (report.progress !== lastProgress || report.text !== lastReport) {
            restartTimer();
            lastProgress = report.progress;
            lastReport = report.text;
          }
          setState({ progress: report.progress, text: report.text });
        },
      }, PINNED_MODEL ? undefined : { context_window_size: CONTEXT_WINDOW }), loadFailed]);

      // Preflight a realistic prompt so a device that cannot sustain prefill can try a smaller model.
      setState({ progress: 1, text: "Warming up GPU kernels…" });
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

      engine = e;
      setState({ status: "ready", text: "On-device inference active" });
      return e;
    } catch (err) {
      console.warn(`WebLLM: ${model} failed to load`, err);
      worker?.terminate();
      worker = null;
    } finally {
      clearTimeout(stallTimer);
    }
  }
  return enterBasicMode("The on-device model could not load. Check the model download connection or WebGPU support, then retry.");
}

/** Start (or join) the model load. Safe to call from any page, any number of times. */
export function preloadEngine(force = false): Promise<MLCEngineInterface | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (force && state.status === "basic") loading = null;
  loading ??= load();
  return loading;
}

export function useWebLLM(): EngineState {
  return useSyncExternalStore(subscribe, () => state, () => IDLE);
}
