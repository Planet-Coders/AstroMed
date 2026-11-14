import { describe, expect, it } from "vitest";
import { CREW_PROFILES, defaultSexFor } from "@/lib/crewProfiles";

describe("User account body scan sex resolution", () => {
  it("resolves female body figure for female crew members", () => {
    expect(defaultSexFor("Cho")).toBe("female");
    expect(defaultSexFor("Silva")).toBe("female");
    expect(defaultSexFor("Park")).toBe("female");
    expect(defaultSexFor("Dr. Amara Lewis")).toBe("female");
  });

  it("resolves male body figure for male crew members", () => {
    expect(defaultSexFor("Vance")).toBe("male");
    expect(defaultSexFor("John")).toBe("male");
    expect(defaultSexFor("Reyes")).toBe("male");
    expect(defaultSexFor("Okonkwo")).toBe("male");
    expect(defaultSexFor("Mission Admin")).toBe("male");
    expect(defaultSexFor("Ground Control")).toBe("male");
  });

  it("assigns sex on every profile in CREW_PROFILES", () => {
    for (const [name, profile] of Object.entries(CREW_PROFILES)) {
      expect(profile.sex, `${name} has valid sex`).toMatch(/^(male|female)$/);
      expect(defaultSexFor(name)).toBe(profile.sex);
    }
  });

  it("defaults unknown names to male", () => {
    expect(defaultSexFor("Guest")).toBe("male");
    expect(defaultSexFor("")).toBe("male");
    expect(defaultSexFor(undefined)).toBe("male");
  });
});
