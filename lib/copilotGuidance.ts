const urgent = /\b(?:chest pain|chest (?:pressure|tightness)|difficulty breathing|trouble breathing|cannot breathe|can't breathe|short(?:ness)? of breath|unconscious|passed out|fainted|throat swelling|swollen throat|severe bleeding|face droop(?:ing)?|slurred speech|worst headache|sudden severe headache)\b/i;
const negated = /\b(?:no|not|without|denies|don't have|do not have)\b(?:\s+\w+){0,4}\s*$/i;

export function emergencyGuidance(question: string) {
  const text = question.replace(/[’]/g, "'");
  const matches = [...text.matchAll(new RegExp(urgent.source, "gi"))];
  const positive = matches.some((match) => {
    const clause = text.slice(0, match.index).split(/[.!?;,]|\b(?:but|however)\b/i).at(-1) ?? "";
    return !negated.test(clause);
  });
  if (!positive) return null;
  if (/^(?:what (?:is|are) |(?:can you )?explain |define )/i.test(text.trim())) {
    return "If this is happening now, contact the onboard crew medical officer (CMO) and commander immediately. Follow the approved emergency procedure.";
  }
  return "Contact the onboard crew medical officer (CMO) and commander immediately. Stop the task and follow the approved emergency procedure without waiting for a ground reply.";
}

export function medicationGuidance(question: string) {
  if (!/\b(?:dosage|prescribe|how much|can i take|should i take|what (?:medication|medicine|drug)|which (?:medication|medicine|drug))\b/i.test(question)
    || !/\b(?:dosage|prescribe|take|medication|medicine|drug|ibuprofen|acetaminophen|paracetamol|melatonin|aspirin|tylenol|antibiotic)\b/i.test(question)) return null;
  return "Ask the onboard crew medical officer (CMO) to check the mission formulary, allergies and other medicines before taking anything.";
}
