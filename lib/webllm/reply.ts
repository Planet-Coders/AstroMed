import type { ChatCompletionMessageParam, MLCEngineInterface, ResponseFormat } from "@mlc-ai/web-llm";

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
  options: { maxTokens?: number; format?: ResponseFormat; stop?: string[] } = {},
) {
  const start = performance.now();
  await engine.resetChat();
  if (isCancelled()) throw new Error("Reply cancelled");
  const stream = await engine.chat.completions.create({
    messages,
    temperature: 0.2,
    max_tokens: options.maxTokens ?? 144,
    response_format: options.format,
    stop: options.stop,
    stream: true,
    stream_options: { include_usage: true },
  });
  let text = "";
  let firstTokenMs: number | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let finishReason: string | null = null;
  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    const delta = choice?.delta?.content;
    if (choice?.finish_reason) finishReason = choice.finish_reason;
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
    text: finishReason && finishReason !== "stop" ? "" : text.trim().replace(/^"([\s\S]*)"$/, "$1").replace(/\*\*/g, ""),
    finishReason,
    metrics: { totalMs: Math.round(performance.now() - start), firstTokenMs, promptTokens, completionTokens } satisfies ReplyMetrics,
  };
}
