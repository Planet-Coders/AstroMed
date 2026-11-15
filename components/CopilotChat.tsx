"use client";

import { useEffect, useRef } from "react";
import { MAX_COPILOT_INPUT } from "@/lib/copilotPrompt";
import type { ReplyMetrics } from "@/lib/webllm/reply";

export type CopilotChatMessage = {
  role: "user" | "assistant";
  content: string;
  /** True while tokens are still arriving from the model. */
  streaming?: boolean;
  mode?: "webllm" | "basic" | "guidance";
  subject?: string;
  personalContext?: { label: string; value: string }[];
  sources?: { id: string; title: string; url: string }[];
  timing?: ReplyMetrics;
  model?: string | null;
};

export function CopilotChat({
  messages,
  input,
  onInputChange,
  onSend,
  onClear,
  onStop,
  placeholder,
  isSending = false,
  className = "h-[min(420px,55vh)]",
}: {
  messages: CopilotChatMessage[];
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onClear: () => void;
  onStop: () => void;
  placeholder?: string;
  isSending?: boolean;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followTail = useRef(true);
  useEffect(() => {
    const scroll = scrollRef.current;
    if (scroll && followTail.current) scroll.scrollTop = scroll.scrollHeight;
  }, [messages, isSending]);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border border-mc-line bg-mc-panel shadow-[0_10px_28px_rgba(60,50,20,0.06)] ring-1 ring-mc-line ${className}`}
    >
      <div className="flex shrink-0 items-start gap-2 border-b border-mc-line px-3 py-2">
        <div className="flex-1">
          <p className="text-xs font-medium text-foreground">Ask co-pilot</p>
          <p className="text-[10px] text-mc-label">Mission oversight can see saved conversations. New chat clears this view.</p>
        </div>
        <button type="button" onClick={onClear} disabled={!messages.length && !input && !isSending}
          className="shrink-0 rounded-md border border-mc-line-strong px-2.5 py-1 text-xs text-mc-link disabled:opacity-40">
          New chat
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
          followTail.current = scrollHeight - scrollTop - clientHeight < 48;
        }}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-2 py-3"
      >
        {messages.length === 0 && !isSending && (
          <div className="space-y-2 px-2">
            <p className="text-[11px] text-mc-label">Ask about your own readings or NASA research.</p>
            {[
              "How does my heart rate compare with my baseline?",
              "What did my last Daily Check record?",
            ].map((question) => (
              <button key={question} type="button" onClick={() => onInputChange(question)}
                className="block rounded-md border border-mc-line px-2.5 py-1.5 text-left text-xs text-mc-link">
                {question}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            data-chat-role={m.role}
            data-chat-mode={m.mode}
            data-chat-model={m.model ?? undefined}
            data-total-ms={m.timing?.totalMs}
            data-first-token-ms={m.timing?.firstTokenMs ?? undefined}
            data-prompt-tokens={m.timing?.promptTokens ?? undefined}
            data-completion-tokens={m.timing?.completionTokens ?? undefined}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[92%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                m.role === "user"
                  ? "rounded-br-md bg-mc-select text-mc-on-select border border-mc-select"
                  : "rounded-bl-md bg-mc-raised text-foreground border border-mc-line"
              }`}
            >
              <p className="whitespace-pre-wrap break-words" data-chat-content>{m.content}</p>
              {m.mode && (
                <p className="mt-2 text-[10px] text-mc-label">
                  {m.mode === "webllm" ? "On-device model" : m.mode === "guidance" ? "Onboard guidance" : "Basic mode"}
                  {m.subject && ` · For ${m.subject}`}
                </p>
              )}
              {!!m.personalContext?.length && (
                <details className="mt-1 text-[11px] text-mc-muted">
                  <summary className="cursor-pointer text-mc-link">Personal data used</summary>
                  <dl className="mt-1 space-y-1">
                    {m.personalContext.map(({ label, value }, index) => (
                      <div key={`${label}-${index}`}>
                        <dt className="font-medium">{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
              {!!m.sources?.length && (
                <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-mc-label">
                  <span>NASA references</span>
                  {m.sources.map(({ id, title, url }) => (
                    <a key={id} href={url} title={title} target="_blank" rel="noreferrer" className="text-mc-link underline">{id}</a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isSending && !messages[messages.length - 1]?.streaming && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-mc-line bg-mc-raised px-3 py-2 text-xs text-mc-muted">
              Thinking…
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-mc-line bg-mc-inset p-2">
        <div className="flex gap-2">
          <input
            value={input}
            aria-label="Question for the co-pilot"
            maxLength={MAX_COPILOT_INPUT}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={placeholder}
            disabled={isSending}
            className="min-w-0 flex-1 rounded-full border border-mc-line-strong bg-mc-panel px-3 py-2 text-xs text-foreground placeholder:text-mc-label focus:border-mc-cyan focus:outline-none disabled:opacity-50"
          />
          {isSending ? <button type="button" onClick={onStop}
            className="shrink-0 rounded-full border border-mc-line-strong px-4 py-2 text-xs font-medium text-mc-soft">
            Stop
          </button> : <button
            type="button"
            onClick={onSend}
            disabled={isSending || !input.trim()}
            className="shrink-0 rounded-full bg-mc-select px-4 py-2 text-xs font-medium text-mc-on-select hover:bg-mc-soft disabled:opacity-40"
          >
            Send
          </button>}
        </div>
      </div>
    </div>
  );
}
