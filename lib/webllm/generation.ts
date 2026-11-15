import type { ChatCompletionMessageParam, ResponseFormat } from "@mlc-ai/web-llm";
import { discardEngine, engineStopped, getEngine, runtimeFailure } from "./engine";
import { streamReply } from "./reply";

type GenerationOptions = {
  signal: AbortSignal;
  timeoutMs: number;
  maxTokens?: number;
  format?: ResponseFormat;
  stop?: string[];
};

const WORKER_STALL_MS = 75_000;
let queue = Promise.resolve();

/** Chat and explanations share the worker's mutable conversation state. */
export function generateReply(messages: ChatCompletionMessageParam[], options: GenerationOptions) {
  const { signal, timeoutMs } = options;
  if (signal.aborted || !getEngine()) return Promise.resolve(null);

  let running: ReturnType<typeof getEngine> = null;
  let stopped = false;
  let finishWaiting!: (value: null) => void;
  const waiting = new Promise<null>((resolve) => { finishWaiting = resolve; });

  const stopWaiting = () => {
    if (stopped) return;
    stopped = true;
    finishWaiting(null);
    running?.interruptGenerate();
  };
  const timer = setTimeout(stopWaiting, timeoutMs);
  signal.addEventListener("abort", stopWaiting, { once: true });

  const job = queue.then(async () => {
    if (stopped) return null;
    const engine = getEngine();
    if (!engine) return null;
    running = engine;
    // A request expiring only ends that request. Retire the engine if its worker
    // still cannot settle, so a short explanation never resets a healthy model.
    const watchdog = setTimeout(() => discardEngine(engine, "stalled"), WORKER_STALL_MS);
    try {
      const reply = await Promise.race([
        streamReply(engine, messages, () => {}, () => stopped, options),
        engineStopped(engine),
      ]);
      return stopped ? null : reply;
    } catch (error) {
      const failure = runtimeFailure(error);
      if (failure) discardEngine(engine, failure);
      else if (!stopped) console.warn("On-device co-pilot generation failed", error);
      return null;
    } finally {
      clearTimeout(watchdog);
    }
  }).finally(() => {
    running = null;
    clearTimeout(timer);
    signal.removeEventListener("abort", stopWaiting);
  });

  // The UI can stop waiting immediately. Release the worker only once the stream
  // settles or the worker is retired, even after an interruption.
  queue = job.then(() => undefined, () => undefined);
  return Promise.race([job, waiting]);
}
