"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { assessRisk, riskLabel, type RiskLevel } from "@/lib/risk";
import { generateCopilotFallback } from "@/lib/copilotFallback";
import { describeCheck, getLatestCheck, type StepId } from "@/lib/selfCheck";
import { describeSpaceWeather, useSpaceWeather } from "@/lib/useSpaceWeather";
import { evaRecommendation, findProtocols, protocolsForReadings } from "@/lib/copilotKnowledge";
import { findEvidence, type EvidenceCard } from "@/lib/copilotEvidence";
import { copilotMessages, repeatsPreviousReply, retrievalQuestion, MAX_COPILOT_INPUT, type CopilotTurn } from "@/lib/copilotPrompt";
import { emergencyGuidance, medicationGuidance } from "@/lib/copilotGuidance";
import { describePersonalBaseline, describeSubjectVitals, selectSubject, type CopilotSession } from "@/lib/copilotSubject";
import { osdrFallbackCitation, studyPageUrl } from "@/lib/osdr";
import { useNasaStudies } from "@/lib/useNasaStudies";
import { useMissionTelemetry } from "@/components/MissionTelemetryProvider";
import { CREW_PROFILES } from "@/lib/crewProfiles";
import { INJURY_TYPES, getInjuries } from "@/lib/injuries";
import { getCycleLog, summarize } from "@/lib/periods";
import { getLatestForUser } from "@/lib/db";
import { getPvtSummary } from "@/components/PVTTest";
import { queueChat } from "@/lib/outbox";
import type { CopilotChatMessage } from "@/components/CopilotChat";
import {
  getEngine,
  discardEngine,
  preloadEngine,
  useWebLLM,
  type EngineStatus,
} from "@/lib/webllm/engine";
import { streamReply, type ReplyMetrics } from "@/lib/webllm/reply";

export type { CopilotSession, CrewBrief } from "@/lib/copilotSubject";

type CopilotContextValue = {
  session: CopilotSession | null;
  setSession: (session: CopilotSession) => void;
  voiceTranscript: string;
  setVoiceTranscript: (t: string) => void;
  messages: CopilotChatMessage[];
  input: string;
  setInput: (v: string) => void;
  sendMessage: () => Promise<void>;
  clearChat: () => void;
  stopReply: () => void;
  isSending: boolean;
  engineStatus: EngineStatus;
  loadProgress: string;
  loadPercent: number | null;
  modelCached: boolean | null;
  modelId: string | null;
  basicReason: string | null;
  replyMetrics: ReplyMetrics | null;
  retryEngine: () => void;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  toggleChat: () => void;
  risk: RiskLevel | null;
};

const CopilotContext = createContext<CopilotContextValue | null>(null);

const GENERATION_TIMEOUT_MS = 75_000;
type ActiveReply = { cancelled: boolean; interrupt?: () => void };

const DAILY_CHECK_TOPICS: { id: StepId; match: RegExp }[] = [
  { id: "bp", match: /\b(?:blood pressure|systolic|diastolic|bp)\b/i },
  { id: "glucose", match: /\b(?:glucose|blood sugar|fasting)\b/i },
  { id: "temperature", match: /\b(?:temperature|fever)\b/i },
  { id: "mood", match: /\b(?:mood|stress|anxious|anxiety)\b/i },
  { id: "sleep", match: /\b(?:sleep|fatigue|tired|eva)\b/i },
  { id: "hydration", match: /\b(?:hydration|dehydration|water|fluid|urine|kidney)\b/i },
];

export function CopilotProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<CopilotSession | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [messages, setMessages] = useState<CopilotChatMessage[]>([]);
  const [input, setInput] = useState("");
  const llm = useWebLLM();
  const spaceWeather = useSpaceWeather();
  const nasaStudies = useNasaStudies();
  const telemetry = useMissionTelemetry();
  const engineStatus = llm.status;
  const [replyMetrics, setReplyMetrics] = useState<ReplyMetrics | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const history = useRef<CopilotTurn | undefined>(undefined);
  const active = useRef<ActiveReply | null>(null);

  const setSession = useCallback((s: CopilotSession) => {
    setSessionState(s);
    setVoiceTranscript(
      (prev) =>
        prev ||
        `"EV1 ${s.userName}: nominal systems, ready for EVA prep."`
    );
  }, []);

  const risk = session?.displayVitals
    ? assessRisk(session.displayVitals)
    : null;

  // Load the model once the console has rendered and the browser is idle, so the
  // download and GPU init never compete with sign-in or the first dashboard fetch.
  useEffect(() => {
    const start = () => void preloadEngine();
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(start, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(start, 1500);
    return () => clearTimeout(id);
  }, []);

  const stopReply = useCallback(() => {
    if (active.current) {
      active.current.cancelled = true;
      active.current.interrupt?.();
    }
    setMessages((m) => m.filter((message) => !message.streaming));
  }, []);

  const clearChat = useCallback(() => {
    stopReply();
    history.current = undefined;
    setMessages([]);
    setInput("");
    setReplyMetrics(null);
  }, [stopReply]);

  useEffect(() => () => {
    if (active.current) {
      active.current.cancelled = true;
      active.current.interrupt?.();
    }
  }, []);

  const sendMessage = useCallback(async () => {
    const question = input.trim().slice(0, MAX_COPILOT_INPUT);
    if (!question || !session || active.current) return;

    const run: ActiveReply = { cancelled: false };
    active.current = run;
    setInput("");
    setReplyMetrics(null);
    setIsSending(true);
    setMessages((m) => [...m, { role: "user", content: question }]);

    const previous = history.current;
    const retrieved = retrievalQuestion(question, previous);
    const subject = selectSubject(question, session, retrieved !== question ? previous?.subject : undefined);
    const followUp = retrieved !== question && subject?.name === previous?.subject ? previous : undefined;
    const topic = followUp ? retrieved : question;
    const guidance = emergencyGuidance(topic) ?? medicationGuidance(topic);
    const engine = guidance || !subject ? null : getEngine();
    void queueChat({ role: "user", content: question, mode: engine ? "webllm" : "basic" });

    let mode: CopilotTurn["mode"] = "basic";
    let sources: EvidenceCard[] = [];
    const personalContext: { label: string; value: string }[] = [];
    let reply = "";
    let metrics: ReplyMetrics | undefined;
    const started = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const showPartial = (content: string) => {
      if (run.cancelled) return;
      setMessages((m) => [
        ...m.filter((message) => !message.streaming),
        { role: "assistant", content, streaming: true },
      ]);
    };

    try {
      if (guidance) {
        reply = guidance;
        mode = "guidance";
      } else if (!subject) {
        reply = "Which crew member should I use for this question? Include one name or callsign.";
        mode = "guidance";
      } else {
        const { own, member, name } = subject;
        const local = !subject.vitals && own
          ? await getLatestForUser(session.userId).catch(() => undefined)
          : undefined;
        if (run.cancelled) return;
        const vitals = subject.vitals ?? local;
        const reading = describeSubjectVitals(vitals);
        if (vitals) personalContext.push({ label: "Available vitals", value: reading.summary });
        const usual = describePersonalBaseline(member, vitals);
        if (usual) personalContext.push({ label: "Personal baseline", value: usual });

        const check = own ? getLatestCheck(session.userId) : null;
        const fullCheck = /\b(?:daily (?:self-)?check|last check)\b/i.test(topic);
        const items = check?.items.filter((item) => fullCheck || DAILY_CHECK_TOPICS.some(({ id, match }) => id === item.id && match.test(topic)));
        const dailyCheck = check && items?.length ? describeCheck({ ...check, items }) : undefined;
        if (own) {
          if (dailyCheck) personalContext.push({ label: "Last Daily Check", value: dailyCheck });
          if (/\b(?:sleep|tired|fatigue|exercise|workout|eva)\b/i.test(topic)) {
            personalContext.push({
              label: "Routine log",
              value: "Sleep " + telemetry.sleepHours.toFixed(1) + " h. Exercise " + telemetry.exerciseMinutes + "/" + telemetry.exerciseTarget + " min.",
            });
          }
          if (/\b(?:pvt|vigilance|reaction time)\b/i.test(topic)) {
            personalContext.push({ label: "Cognitive test", value: getPvtSummary() });
          }
        }
        const profile = CREW_PROFILES[name];
        if (profile && /\b(?:allerg(?:y|ies|ic)|medic|role|cmo)\b/i.test(topic)) {
          personalContext.push({ label: "Demo crew profile", value: profile.role + ". Recorded allergies: " + profile.allergies + "." });
        }
        if (/\b(?:injur|pain|burn|cut|bruise|sprain|swelling)\w*\b/i.test(topic)) {
          const injuries = getInjuries(name).filter((injury) => !injury.healed).slice(0, 2);
          for (const injury of injuries) {
            const last = injury.updates.at(-1);
            personalContext.push({
              label: "Injury log",
              value: INJURY_TYPES[injury.type].label + " on " + injury.area + ", recorded pain " + (last?.pain ?? "?") + "/10.",
            });
          }
        }
        if (/\b(?:period|menstrual|menstruation|cycle|cramp|spotting)\b/i.test(topic)) {
          const log = getCycleLog(name);
          if (log.days.length || log.suppressed) {
            const info = summarize(log);
            personalContext.push({ label: "Cycle log", value: info.cycleDay ? "Cycle day " + info.cycleDay : "A cycle log is available." });
          }
        }

        sources = findEvidence(topic);
        const osdrStudies = nasaStudies.data?.studies ?? [];
        const researchQuestion = /\b(?:study|studies|research|data set|dataset|osdr|mouse|mice|animal|cytokine|biomarker)\b/i.test(topic);
        if (researchQuestion) {
          const analog = osdrFallbackCitation(topic, osdrStudies);
          const id = analog?.match(/^OSD-\d+/)?.[0];
          if (analog && id) sources = [...sources.slice(0, 1), {
            id, title: "NASA OSDR research analog", url: studyPageUrl(id), keywords: [],
            finding: analog, limit: "Use as research context only.",
          }];
        }
        const fallBack = () => generateCopilotFallback(topic, {
          userName: name, vitalsSummary: [reading.summary, usual].filter(Boolean).join(". "), risk: reading.risk,
          dailyCheck,
          osdrStudies: researchQuestion ? osdrStudies : [],
        }, sources);

        if (engine) {
          const arrhythmia = subject.vitals?.arrhythmia ?? (own && telemetry.arrhythmia);
          const protocols = findProtocols(topic, protocolsForReadings({
            ...vitals, ppCO2: telemetry.ppCO2, arrhythmia,
          }), 2);
          const context = [
            "Subject: " + name,
            reading.risk ? "Console flag: " + riskLabel(reading.risk) : "Vitals unavailable for this subject.",
            ...personalContext.map(({ label, value }) => label + ": " + value),
            /\b(?:cabin|co2|headache|air quality)\b/i.test(topic) ? "Cabin CO2 " + telemetry.ppCO2.toFixed(1) + " mmHg." : "",
            /\b(?:solar|radiation|dosimeter|shelter)\b/i.test(topic) ? describeSpaceWeather(spaceWeather) : "",
            /\b(?:eva|spacewalk)\b/i.test(topic) ? evaRecommendation({ ...vitals, sleepHours: own ? telemetry.sleepHours : undefined, arrhythmia }) : "",
            "Demo procedures:",
            ...protocols.map((p) => p.title + ": " + p.text),
          ].filter(Boolean).join("\n");
          run.interrupt = () => engine.interruptGenerate();
          try {
            const result = await Promise.race([
              streamReply(engine, copilotMessages(question, context, sources, followUp), showPartial, () => run.cancelled),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  discardEngine(engine, "The on-device model timed out. You can retry it from the co-pilot panel.");
                  reject(new Error("Generation timed out"));
                }, GENERATION_TIMEOUT_MS);
              }),
            ]);
            if (run.cancelled) return;
            const includesDose = /\d(?:[\d.,]*\d)?\s*(?:mg|mcg|µg|milligrams?|micrograms?)\b(?!\s*\/\s*d[lL])/i.test(result.text);
            if (result.text && !includesDose && !repeatsPreviousReply(question, result.text, previous)) {
              reply = result.text;
              metrics = result.metrics;
              mode = "webllm";
            }
          } catch (err) {
            if (!run.cancelled) {
              console.warn("On-device co-pilot reply failed", err);
              if (/device.*lost|already been disposed|model not loaded/i.test(String(err))) {
                discardEngine(engine, "WebGPU stopped during inference. Basic mode is available. Retry to reload the on-device model.");
              }
            }
          }
        }
        if (!reply) {
          reply = fallBack();
          const source = sources[0];
          if (reply === followUp?.reply && source && /\b(?:short|one sentence|brief|summari[sz]e)\b/i.test(question)) {
            reply = `${source.finding} [${source.id}]`;
          }
        }
      }
      if (run.cancelled) return;
      history.current = { question, reply, mode, subject: subject?.name ?? "", topic: followUp?.topic ?? question };
      const storedMode = mode === "webllm" ? "webllm" : "basic";
      void queueChat({ role: "assistant", content: reply, mode: storedMode });
      const timing = metrics ?? { totalMs: Math.round(performance.now() - started), firstTokenMs: null, promptTokens: null, completionTokens: null };
      setReplyMetrics(timing);
      setMessages((m) => [
        ...m.filter((message) => !message.streaming),
        {
          role: "assistant", content: reply, mode,
          subject: guidance ? undefined : subject?.name,
          personalContext, sources: sources.map(({ id, title, url }) => ({ id, title, url })),
          timing, model: mode === "webllm" ? llm.model : null,
        },
      ]);
    } catch (err) {
      console.warn("Co-pilot could not prepare the reply", err);
      if (!run.cancelled) {
        setMessages((m) => [
          ...m.filter((message) => !message.streaming),
          { role: "assistant", mode: "basic", content: "I couldn’t load the onboard data for this reply. Try again." },
        ]);
      }
    } finally {
      clearTimeout(timer);
      active.current = null;
      setIsSending(false);
    }
  }, [input, llm.model, nasaStudies.data, session, spaceWeather, telemetry]);

  const toggleChat = useCallback(() => setChatOpen((o) => !o), []);

  const value: CopilotContextValue = {
    session,
    setSession,
    voiceTranscript,
    setVoiceTranscript,
    messages,
    input,
    setInput,
    sendMessage,
    clearChat,
    stopReply,
    isSending,
    engineStatus,
    loadProgress: llm.text,
    loadPercent: llm.progress,
    modelCached: llm.cached,
    modelId: llm.model,
    basicReason: llm.reason,
    replyMetrics,
    retryEngine: () => void preloadEngine(true),
    chatOpen,
    setChatOpen,
    toggleChat,
    risk,
  };

  return (
    <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>
  );
}

export function useCopilot() {
  const ctx = useContext(CopilotContext);
  if (!ctx) throw new Error("useCopilot requires CopilotProvider");
  return ctx;
}
