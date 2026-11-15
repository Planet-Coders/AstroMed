import { afterEach, expect, it, vi } from "vitest";
import { generateReply } from "@/lib/webllm/generation";

const { getEngine, discardEngine } = vi.hoisted(() => ({ getEngine: vi.fn(), discardEngine: vi.fn() }));
vi.mock("@/lib/webllm/engine", () => ({ getEngine, discardEngine }));

function controlledEngine() {
  let finishFirst!: () => void;
  const first = new Promise<void>((resolve) => { finishFirst = resolve; });
  const create = vi.fn(async ({ messages }: { messages: { content: string }[] }) => {
    const topic = messages[0].content;
    return (async function* () {
      if (topic === "chat") await first;
      yield { choices: [{ delta: { content: topic } }] };
    })();
  });
  const engine = { resetChat: vi.fn(async () => {}), chat: { completions: { create } }, interruptGenerate: vi.fn() };
  getEngine.mockReturnValue(engine);
  return { finishFirst, create, engine };
}

function request(content: string, signal = new AbortController().signal, timeoutMs = 1000) {
  return generateReply([{ role: "user", content }], { signal, timeoutMs });
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("serializes chat and inline explanations through one engine", async () => {
  const { finishFirst, create, engine } = controlledEngine();
  const chat = request("chat");
  const insight = request("insight");
  await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(engine.resetChat).toHaveBeenCalledTimes(1);
  finishFirst();
  expect((await chat)?.text).toBe("chat");
  expect((await insight)?.text).toBe("insight");
  expect(engine.resetChat).toHaveBeenCalledTimes(2);
});

it("removes a cancelled queued request without interrupting the active reply", async () => {
  const { finishFirst, create, engine } = controlledEngine();
  const chat = request("chat");
  await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  const controller = new AbortController();
  const insight = request("insight", controller.signal);
  controller.abort();
  expect(await insight).toBeNull();
  expect(engine.interruptGenerate).not.toHaveBeenCalled();
  finishFirst();
  await chat;
  expect((await request("follow-up"))?.text).toBe("follow-up");
  expect(create).toHaveBeenCalledTimes(2);
});

it("returns at the deadline while waiting behind a chat without discarding its engine", async () => {
  vi.useFakeTimers();
  const { finishFirst, create } = controlledEngine();
  const chat = request("chat", undefined, 1000);
  const insight = request("insight", undefined, 10);
  await vi.advanceTimersByTimeAsync(10);
  expect(await insight).toBeNull();
  expect(discardEngine).not.toHaveBeenCalled();
  finishFirst();
  await chat;
  expect((await request("follow-up"))?.text).toBe("follow-up");
  expect(create).toHaveBeenCalledTimes(2);
});
