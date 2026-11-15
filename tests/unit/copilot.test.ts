import { describe, expect, it, vi } from "vitest";
import { findEvidence } from "@/lib/copilotEvidence";
import { generateCopilotFallback } from "@/lib/copilotFallback";
import { emergencyGuidance, medicationGuidance } from "@/lib/copilotGuidance";
import { copilotMessages, repeatsPreviousReply, retrievalQuestion, type CopilotTurn } from "@/lib/copilotPrompt";
import { describePersonalBaseline, describeSubjectVitals, selectSubject, type CopilotSession } from "@/lib/copilotSubject";
import { streamReply, type ReplyEngine } from "@/lib/webllm/reply";

const previous: CopilotTurn = {
  mode: "webllm", subject: "Cho", question: "Why does sleep affect alertness?",
  topic: "Why does sleep affect alertness?", reply: "Sleep loss impairs performance.",
};

describe("co-pilot conversation", () => {
  it("uses the actual follow-up, without the old Park example or a basic-mode reply", () => {
    const topic = retrievalQuestion("Can you explain that?", previous);
    expect(findEvidence(topic)[0]?.id).toBe("NTRS 20160003864");
    const full = copilotMessages("Can you explain that?", "Subject: Cho", [], previous);
    expect(full.map(({ role }) => role)).toEqual(["system", "user", "assistant", "user"]);
    expect(full.at(-1)?.content).toBe("Can you explain that?");
    expect(JSON.stringify(full)).not.toContain("Park");
    expect(copilotMessages("Why?", "Subject: Cho", [], { ...previous, mode: "basic" })).toHaveLength(2);
    expect(retrievalQuestion("What is my oxygen saturation?", previous)).toBe("What is my oxygen saturation?");
    expect(retrievalQuestion("Why does blood sugar change?", previous)).toBe("Why does blood sugar change?");
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

  it("routes red-flag symptoms promptly and avoids dosing", () => {
    expect(emergencyGuidance("I have chest pain but a normal heart rate")).toMatch(/CMO.*immediately/);
    expect(emergencyGuidance("I have no chest pain or difficulty breathing.")).toBeNull();
    expect(medicationGuidance("How much ibuprofen should I take?")).toMatch(/CMO.*allergies/);
  });
});
