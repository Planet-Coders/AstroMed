import type { ChatCompletionMessageParam, MLCEngineInterface } from "@mlc-ai/web-llm";

export type ReplyMetrics = {
  totalMs: number;
  firstTokenMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
};

export type ReplyEngine = Pick<MLCEngineInterface, "resetChat" | "chat">;

/** The caller's messages are the source of conversation state for each generation. */
export async function streamReply(
  engine: ReplyEngine,
  messages: ChatCompletionMessageParam[],
  onText: (text: string) => void,
  isCancelled = () => false,
) {
  const start = performance.now();
  await engine.resetChat();
  if (isCancelled()) throw new Error("Reply cancelled");
  const stream = await engine.chat.completions.create({
    messages,
    temperature: 0.2,
    max_tokens: 144,
    stream: true,
    stream_options: { include_usage: true },
  });
  let text = "";
  let firstTokenMs: number | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      firstTokenMs ??= Math.round(performance.now() - start);
      text += delta;
      onText(text);
    }
    if (chunk.usage) {
      promptTokens = chunk.usage.prompt_tokens;
      completionTokens = chunk.usage.completion_tokens;
    }
  }
  return {
    text: text.trim().replace(/^"([\s\S]*)"$/, "$1").replace(/\*\*/g, ""),
    metrics: { totalMs: Math.round(performance.now() - start), firstTokenMs, promptTokens, completionTokens } satisfies ReplyMetrics,
  };
}
