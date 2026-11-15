import type { ChatCompletionMessageParam, ResponseFormat } from "@mlc-ai/web-llm";
import { discardEngine, getEngine } from "./engine";
import { streamReply } from "./reply";

type GenerationOptions = {
  signal: AbortSignal;
  timeoutMs: number;
  maxTokens?: number;
  format?: ResponseFormat;
  onText?: (text: string) => void;
};

let queue = Promise.resolve();

/** Chat and explanations share the worker's mutable conversation state. */
export function generateReply(messages: ChatCompletionMessageParam[], options: GenerationOptions) {
  const { signal, timeoutMs, onText } = options;
  if (signal.aborted || !getEngine()) return Promise.resolve(null);

  let running: ReturnType<typeof getEngine> = null;
  let timedOut = false;
  let expire!: (value: null) => void;
  let cancel!: (value: null) => void;
  const deadline = new Promise<null>((resolve) => { expire = resolve; });
  const cancelled = new Promise<null>((resolve) => { cancel = resolve; });
  const timer = setTimeout(() => {
    timedOut = true;
    if (running) {
      discardEngine(running, "The on-device model timed out. Retry it from the co-pilot panel.");
    }
    expire(null);
  }, timeoutMs);

  const abort = () => {
    cancel(null);
    running?.interruptGenerate();
  };
  signal.addEventListener("abort", abort, { once: true });
  const stopped = () => signal.aborted || timedOut;

  const job = queue.then(async () => {
    if (stopped()) return null;
    const engine = getEngine();
    if (!engine) return null;
    running = engine;
    try {
      const reply = await Promise.race([
        streamReply(engine, messages, (text) => {
          if (!stopped()) onText?.(text);
        }, stopped, options),
        deadline,
      ]);
      return stopped() ? null : reply;
    } catch (error) {
      if (!stopped()) console.warn("On-device co-pilot generation failed", error);
      if (/device.*lost|already been disposed|model not loaded/i.test(String(error))) {
        discardEngine(engine, "WebGPU stopped during inference. Basic mode is available.");
      }
      return null;
    }
  }).finally(() => {
    running = null;
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  });

  // The UI can stop waiting immediately. Release the worker only once the stream
  // settles or the deadline discards the worker, even after an interruption.
  queue = job.then(() => undefined, () => undefined);
  return Promise.race([job, cancelled, deadline]);
}
