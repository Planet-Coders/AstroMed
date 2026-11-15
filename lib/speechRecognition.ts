/** Web Speech API (Chrome / Edge). Not available in all browsers. */

export type SpeechListenStatus = "idle" | "listening" | "processing" | "error";

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.SpeechRecognition || window.webkitSpeechRecognition
  );
}

export function createSpeechRecognition(): SpeechRecognition | null {
  if (!isSpeechRecognitionSupported()) return null;
  const Ctor =
    window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  return recognition;
}

export function speechErrorMessage(error: string): string {
  switch (error) {
    case "not-allowed":
      return "Microphone permission denied. Allow microphone access for this site (the lock icon in the address bar), then try again.";
    case "no-speech":
      return "No speech detected. Try again and speak clearly.";
    case "audio-capture":
      return "No microphone found or capture failed.";
    case "network":
      return "Couldn't reach the browser's voice service. Voice typing in Chrome and Edge sends your audio to an online speech service, even when the app and the on-device AI work. Check your connection, VPN or firewall, then press Voice check-in again, or type your check-in instead.";
    case "service-not-allowed":
      return "This browser has turned off its voice service. Try Chrome or Edge, or type your check-in instead.";
    case "language-not-supported":
      return "The voice service doesn't support this language. Type your check-in instead.";
    case "aborted":
      return "Listening stopped.";
    default:
      return `Speech error: ${error}`;
  }
}
