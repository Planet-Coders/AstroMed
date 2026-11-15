"use client";

import { CopilotChat } from "./CopilotChat";
import { useCopilot } from "./CopilotProvider";

export function CopilotFloatingLauncher() {
  const {
    chatOpen,
    toggleChat,
    setChatOpen,
    messages,
    input,
    setInput,
    sendMessage,
    clearChat,
    stopReply,
    isSending,
    engineStatus,
    prefersBasic,
    setBasicPreference,
    retryEngine,
    loadProgress,
    session,
  } = useCopilot();

  if (!session) return null;
  const canPauseModel = engineStatus === "ready" || engineStatus === "loading";
  const modeLabel = canPauseModel ? "Use Basic mode"
    : prefersBasic ? "Use on-device AI"
      : engineStatus === "basic" ? "Try on-device AI again" : "Start on-device AI";

  return (
    <>
      {chatOpen && (
        <div
          className="fixed bottom-20 right-4 sm:right-6 z-40 w-[min(calc(100vw-2rem),400px)]"
          role="dialog"
          aria-label="Flight Surgeon Co-Pilot chat"
        >
          <div className="relative">
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-mc-line-strong bg-mc-panel text-sm text-foreground shadow-lg hover:bg-mc-raised"
              aria-label="Close chat"
            >
              ×
            </button>
            <CopilotChat
              messages={messages}
              input={input}
              onInputChange={setInput}
              onSend={() => void sendMessage()}
              onClear={clearChat}
              onStop={stopReply}
              modeLabel={modeLabel}
              onSwitchMode={canPauseModel ? () => setBasicPreference(true) : retryEngine}
              isSending={isSending}
              className="h-[min(480px,70vh)]"
              placeholder={
                engineStatus === "loading"
                  ? loadProgress
                  : engineStatus !== "ready"
                    ? "Ask the built-in rules or look up a reading…"
                    : "Ask about symptoms, vitals or emergencies…"
              }
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={toggleChat}
        className={`fixed bottom-3 right-3 sm:bottom-4 sm:right-6 z-40 flex h-12 w-12 items-center justify-center gap-2 rounded-full text-sm font-medium shadow-lg sm:h-auto sm:w-auto sm:px-4 sm:py-3 shadow-[0_8px_24px_rgba(60,50,20,0.12)] transition ${
          chatOpen
            ? "border border-mc-line-strong bg-mc-panel text-foreground"
            : "border border-mc-select bg-mc-select text-mc-on-select hover:bg-mc-soft"
        }`}
        aria-expanded={chatOpen}
        aria-label={chatOpen ? "Close co-pilot chat" : "Ask co-pilot"}
      >
        <span className="hidden h-2 w-2 rounded-full bg-emerald-400 sm:flex" aria-hidden />
        <span className="text-lg leading-none sm:hidden" aria-hidden>
          {chatOpen ? "✕" : "💬"}
        </span>
        <span className="hidden sm:inline">{chatOpen ? "Close co-pilot" : "Ask co-pilot"}</span>
      </button>
    </>
  );
}
