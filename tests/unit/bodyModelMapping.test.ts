import { describe, expect, it } from "vitest";
import { BODY_AREAS, areaFor } from "@/lib/injuries";
import { frontToModel, modelToFront } from "@/lib/bodyModelMapping";
import { BODY_JOINTS } from "@/lib/bodyModelJoints";

describe("3D body ↔ front-view injury positions", () => {
  for (const figure of ["male", "female"] as const) {
    it(`keeps every named area when a marker goes to the ${figure} 3D body and back`, () => {
      for (const a of BODY_AREAS) {
        if (a.name === "Upper back" || a.name === "Lower back") continue; // back areas share front spots
        if (figure === "male" && a.name.endsWith("breast")) continue;
        const back = modelToFront(figure, frontToModel(figure, a));
        expect(areaFor(back.x, back.y, figure), a.name).toBe(areaFor(a.x, a.y, figure));
      }
    });

    it(`names the joints of the ${figure} model correctly`, () => {
      const J = BODY_JOINTS[figure];
      const name = (x: number, y: number) => {
        const p = modelToFront(figure, { x, y });
        return areaFor(p.x, p.y, figure);
      };
      expect(name(J["l-elbow"][0], J["l-elbow"][1])).toBe("Left elbow");
      expect(name(-J["l-elbow"][0], J["l-elbow"][1])).toBe("Right elbow");
      expect(name(J["l-knee"][0], J["l-knee"][1])).toBe("Left knee");
      expect(name(-J["l-hand"][0], J["l-hand"][1] - 0.02)).toMatch(/Right (wrist|hand)/);
      expect(name(0, J["spine-1"][1])).toBe("Chest");
      expect(name(0, J["spine-3"][1])).toBe("Abdomen");
      expect(name(0, J["head-2"][1] - 0.03)).toBe("Head");
    });
  }
});
