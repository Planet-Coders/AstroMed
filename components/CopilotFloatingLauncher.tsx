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
    loadPercent,
    session,
  } = useCopilot();

  if (!session) return null;

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
              isSending={isSending}
              className="h-[min(480px,70vh)]"
              placeholder={
                engineStatus === "loading"
                  ? `AI loading${loadPercent != null ? ` ${Math.round(loadPercent * 100)}%` : ""}. Basic answers work now…`
                  : engineStatus === "basic"
                    ? "Basic mode: ask about symptoms or emergencies…"
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
        <span className="sm:hidden" aria-hidden="true">
          {chatOpen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          )}
        </span>
        <span className="hidden sm:inline">{chatOpen ? "Close co-pilot" : "Ask co-pilot"}</span>
      </button>
    </>
  );
}
