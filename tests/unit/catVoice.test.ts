import { describe, expect, it } from "vitest";
import { pickCatVoice } from "@/lib/voiceReminder";

const v = (name: string, lang = "en-US") => ({ name, lang }) as SpeechSynthesisVoice;

describe("pickCatVoice", () => {
  it("prefers the child-like Ana voice over others", () => {
    expect(pickCatVoice([v("Microsoft Guy Online"), v("Microsoft Aria Online"), v("Microsoft Ana Online (Natural)")])?.name).toContain("Ana");
  });
  it("falls back to an en-US female, then any English voice", () => {
    expect(pickCatVoice([v("Google Deutsch", "de-DE"), v("Samantha")])?.name).toBe("Samantha");
    expect(pickCatVoice([v("Daniel", "en-GB")])?.name).toBe("Daniel");
    expect(pickCatVoice([v("Google Deutsch", "de-DE")])).toBeNull();
  });
});
