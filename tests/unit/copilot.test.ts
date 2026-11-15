import { describe, expect, it, vi } from "vitest";
import { findEvidence } from "@/lib/copilotEvidence";
import { describeCopilotDailyCheck, loadCopilotDailyCheck } from "@/lib/copilotDailyCheck";
import { generateCopilotFallback } from "@/lib/copilotFallback";
import { emergencyGuidance, medicationGuidance } from "@/lib/copilotGuidance";
import { completeChatParagraph, copilotMessages, repeatsPreviousReply, retrievalQuestion, type CopilotTurn } from "@/lib/copilotPrompt";
import { describePersonalBaseline, describeSubjectVitals, selectSubject, type CopilotSession } from "@/lib/copilotSubject";
import { streamReply, type ReplyEngine } from "@/lib/webllm/reply";

const previous: CopilotTurn = {
  mode: "webllm", subject: "Cho", question: "Why does sleep affect alertness?",
  topic: "Why does sleep affect alertness?", reply: "Sleep loss impairs performance.",
};

describe("co-pilot conversation", () => {
  it("uses the previous topic for a follow-up and includes the earlier turns in order", () => {
    const lookup = {
      ...previous, mode: "record" as const, question: "What did my last Daily Check record?",
      reply: "Blood pressure 116/76 mmHg.", topic: "My Daily Check",
    };
    const history = [lookup, previous];
    const { topic, reference } = retrievalQuestion("Can you explain that?", history);
    expect(findEvidence(topic)[0]?.id).toBe("NTRS 20160003864");
    expect(reference).toBe(previous);
    const full = copilotMessages("Can you explain that?", "Subject: Cho", [], { history, subject: "Cho", reference });
    expect(full.map(({ role }) => role)).toEqual(["system", "user", "assistant", "user", "assistant", "user"]);
    expect(full.slice(1, -1).map(({ content }) => content)).toEqual([lookup.question, lookup.reply, previous.question, previous.reply]);
    expect(full.at(-1)?.content).toBe("Can you explain that?");
    expect(JSON.stringify(full)).not.toContain("Park");
    expect(retrievalQuestion("What is my oxygen saturation?", history).reference).toBeUndefined();
    expect(retrievalQuestion("Why does blood sugar change?", history).topic).toBe("Why does blood sugar change?");
  });

  it("retrieves a referenced older turn in a long conversation and keeps crew histories scoped", () => {
    const first = { ...previous, question: "My practice callsign is Quartz Kite.", reply: "Quartz Kite." };
    const otherCrew = { ...previous, subject: "Park", question: "What is Park's pressure?", reply: "Park's reading was 107/67." };
    const history = [first, otherCrew, ...Array.from({ length: 25 }, (_, index) => ({
      ...previous, question: "Sleep question " + index, reply: "Sleep loss impairs performance. ".repeat(10),
    }))];
    const question = "What practice callsign did I tell you earlier in this chat?";
    const { reference } = retrievalQuestion(question, history);
    expect(reference).toBe(first);
    const prompt = copilotMessages(question, "Subject: Cho", [], {
      history, subject: "Cho", reference, model: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    });
    expect(prompt[1].content).toBe(first.question);
    expect(prompt.slice(1).map(({ content }) => content)).not.toContain(otherCrew.reply);
    expect(prompt.slice(1).map(({ content }) => content)).toContain(history.at(-1)?.question);
    expect(prompt.length).toBeLessThan(history.length * 2);
    expect(prompt.at(-1)?.content).toBe(question);
  });

  it("removes an unfinished list introduction after a complete reply sentence", () => {
    expect(completeChatParagraph("The recorded sleep was 7.2 hours. This means:")).toBe("The recorded sleep was 7.2 hours.");
    expect(completeChatParagraph("Your results were:")).toBe("");
    expect(completeChatParagraph("The recorded pressure was 116/76 mmHg.")).toBe("The recorded pressure was 116/76 mmHg.");
  });

  it("detects a stale reply to a different topic", () => {
    expect(repeatsPreviousReply("What is the cabin radiation?", "Sleep loss impairs performance!", previous)).toBe(true);
    expect(repeatsPreviousReply(previous.question, previous.reply, previous)).toBe(false);
    expect(repeatsPreviousReply("What is my HRV?", previous.reply, { ...previous, question: "What is my pulse?" })).toBe(true);
  });

  it("resets model state before every streamed request and reports real usage", async () => {
    const events: string[] = [];
    const resetChat = vi.fn(async () => { events.push("reset"); });
    const create = vi.fn(async ({ messages }: { messages: {content: string}[] }) => {
      const last = messages.at(-1)?.content ?? "";
      events.push(last);
      return (async function* () {
        yield { choices: [{ delta: { content: last } }] };
        yield { choices: [], usage: { prompt_tokens: 30, completion_tokens: 5 } };
      })();
    });
    const engine = { resetChat, chat: { completions: { create } } } as unknown as ReplyEngine;
    const first = await streamReply(engine, copilotMessages("Sleep?", "Subject: Cho", []), () => {});
    const second = await streamReply(engine, copilotMessages("Glucose?", "Subject: Cho", []), () => {});
    expect(events).toEqual(["reset", "Sleep?", "reset", "Glucose?"]);
    expect([first.text, second.text]).toEqual(["Sleep?", "Glucose?"]);
    expect(second.metrics).toMatchObject({ promptTokens: 30, completionTokens: 5, firstTokenMs: expect.any(Number) });
  });

  it("does not start a new completion after Stop or New chat cancels the request", async () => {
    const create = vi.fn();
    const engine = { resetChat: vi.fn(async () => {}), chat: { completions: { create } } } as unknown as ReplyEngine;
    await expect(streamReply(engine, copilotMessages("Sleep?", "Subject: Cho", []), () => {}, () => true))
      .rejects.toThrow("Reply cancelled");
    expect(create).not.toHaveBeenCalled();
  });

  it("discards text when the model runs out of tokens before completing its reply", async () => {
    const create = vi.fn(async () => (async function* () {
      yield { choices: [{ delta: { content: "An unfinished answer" }, finish_reason: "length" }] };
    })());
    const engine = { resetChat: vi.fn(async () => {}), chat: { completions: { create } } } as unknown as ReplyEngine;
    const result = await streamReply(engine, copilotMessages("Sleep?", "Subject: Cho", []), () => {});
    expect(result).toMatchObject({ text: "", finishReason: "length" });
  });
});

describe("co-pilot grounding", () => {
  const session: CopilotSession = {
    userId: "id-1", userName: "Cho", patientName: "Park",
    displayVitals: { heartRate: 72, hrv: 60, spo2: 98, radiation: 0.05 },
    crew: [
      { name: "Park", callsign: "MS1", risk: "GREEN", vitals: null, usualHr: 73, usualHrv: 65 },
      { name: "Cho", callsign: "EV2", risk: "GREEN", vitals: null, usualHr: 69, usualHrv: 54 },
    ],
  };
  it("keeps the signed-in user's requests separate from the displayed patient", () => {
    expect(selectSubject("What is my pulse?", session)).toMatchObject({ name: "Cho", own: true, vitals: null });
    expect(selectSubject("Can you check MS1's pulse?", session)).toMatchObject({ name: "Park", own: false, vitals: session.displayVitals });
    expect(selectSubject("Compare Cho and Park", session)).toBeNull();
    expect(describeSubjectVitals().risk).toBeNull();
    expect(describePersonalBaseline(session.crew?.[0], session.displayVitals)).toBe(
      "usual heart rate 73 bpm (available reading is 1 bpm lower), usual HRV 65 ms (available reading is 5 ms lower)",
    );
  });

  it("includes the displayed crew member's ECG warning in grounded vitals", () => {
    const reading = describeSubjectVitals({ heartRate: 72, spo2: 98, arrhythmia: true });
    expect(reading.risk).toBe("RED");
    expect(reading.summary).toContain("irregular heart rhythm on ECG");
  });

  it("uses a verified NASA source by topic and reports a local reading verbatim", () => {
    const ctx = { userName: "Cho", vitalsSummary: "no vitals available", risk: null, dailyCheck: "Daily Check: 116/76 mmHg." };
    expect(generateCopilotFallback("Why is dehydration a kidney-stone risk?", ctx)).toMatch(/NTRS 20240012429/);
    expect(findEvidence("menu inspection")).toEqual([]);
    expect(generateCopilotFallback("What was my last Daily Check?", ctx)).toBe(ctx.dailyCheck);
    expect(generateCopilotFallback("What's my oxygen tank pressure?", ctx)).toMatch(/don’t have enough/);
  });

  it("reports the latest offline retest without attributing earlier readings to it", async () => {
    const at = Date.now();
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({
      "id-1": {
        userId: "id-1", at, merged: true,
        items: [
          { id: "bp", label: "Blood pressure", display: "116/76 mmHg", level: "GREEN" },
          { id: "hydration", label: "Hydration", display: "1600 mL", level: "YELLOW" },
        ],
        recordedItems: { bp: { at: at - 60_000 }, hydration: { at, display: "1600 mL", level: "YELLOW" } },
      },
    }) });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Offline"); }));
    try {
      const question = "What did my last Daily Check record?";
      const check = await loadCopilotDailyCheck("id-1", question, new AbortController().signal);
      const reply = describeCopilotDailyCheck(check, question);
      expect(reply).toContain("Daily Check retest");
      expect(reply).toContain("1600 mL");
      expect(reply).not.toContain("116/76 mmHg");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("routes red-flag symptoms promptly and avoids dosing", () => {
    expect(emergencyGuidance("I have chest pain but a normal heart rate")).toMatch(/CMO.*immediately/);
    expect(emergencyGuidance("I have no chest pain or difficulty breathing.")).toBeNull();
    expect(medicationGuidance("How much ibuprofen should I take?")).toMatch(/CMO.*allergies/);
  });
});
