"use client";

import { useEffect, useRef } from "react";

export type CopilotChatMessage = {
  role: "user" | "assistant";
  content: string;
  /** True while tokens are still arriving from the model. */
  streaming?: boolean;
};

export function CopilotChat({
  messages,
  input,
  onInputChange,
  onSend,
  placeholder,
  isSending = false,
  className = "h-[min(420px,55vh)]",
}: {
  messages: CopilotChatMessage[];
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  isSending?: boolean;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border border-mc-line bg-mc-panel shadow-[0_10px_28px_rgba(60,50,20,0.06)] ring-1 ring-mc-line ${className}`}
    >
      <div className="shrink-0 border-b border-mc-line px-3 py-2">
        <p className="text-xs font-medium text-foreground">Ask co-pilot</p>
        <p className="text-[10px] text-mc-label">
          Onboard AI · conversations are saved and visible to mission oversight (flight surgeon).
        </p>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-2 py-3"
      >
        {messages.length === 0 && (
          <p className="px-2 text-center text-[11px] text-mc-label">
            Ask about symptoms, vitals, or emergency steps.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[92%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                m.role === "user"
                  ? "rounded-br-md bg-mc-select text-mc-on-select border border-mc-select"
                  : "rounded-bl-md bg-mc-raised text-foreground border border-mc-line"
              }`}
            >
              {m.content}
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
        <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
      </div>

      <div className="shrink-0 border-t border-mc-line bg-mc-inset p-2">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={placeholder}
            disabled={isSending}
            className="min-w-0 flex-1 rounded-full border border-mc-line-strong bg-mc-panel px-3 py-2 text-xs text-foreground placeholder:text-mc-label focus:border-mc-cyan focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={isSending || !input.trim()}
            className="shrink-0 rounded-full bg-mc-select px-4 py-2 text-xs font-medium text-mc-on-select hover:bg-mc-soft disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
