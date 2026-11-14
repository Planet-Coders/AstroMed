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

describe("voiceAttempts", () => {
  const voice = (name: string, localService: boolean, lang = "en-US") => ({ name, lang, localService }) as SpeechSynthesisVoice;

  it("tries the cute online voice, then a local voice, then the browser default", async () => {
    const { voiceAttempts } = await import("@/lib/voiceReminder");
    const ana = voice("Microsoft Ana Online (Natural)", false);
    const zira = voice("Microsoft Zira", true);
    const a = voiceAttempts([voice("Microsoft David", true), zira, ana]);
    expect(a.map((x) => x.voice?.name ?? null)).toEqual([ana.name, zira.name, null]);
    expect(a[0].pitch).toBeLessThan(2); // online voices get a gentler pitch
    expect(a[1].pitch).toBe(2);
  });

  it("always ends with the default voice and has no duplicates", async () => {
    const { voiceAttempts } = await import("@/lib/voiceReminder");
    const zira = voice("Microsoft Zira", true);
    expect(voiceAttempts([zira]).map((x) => x.voice)).toEqual([zira, null]);
    expect(voiceAttempts([]).map((x) => x.voice)).toEqual([null]);
  });
});
