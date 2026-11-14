import { BODY_JOINTS } from "./bodyModelJoints";

/**
 * Injury spots are stored as a front-view position: x and y as % of a 1:2 box around the figure
 * (x < 50 is the figure's right side, y = 0 at the top of the head). That's what `areaFor` and
 * `BODY_AREAS` in lib/injuries.ts use.
 *
 * The 3D model has different proportions (its arms hang higher, for one), so a straight scale would
 * name the wrong body part. Instead the body is split into matching chains (head, trunk, each arm,
 * each leg) with landmarks in both spaces, and a point keeps its place along its chain.
 */

type Figure = "male" | "female";
type P = { x: number; y: number };
type Chain = { m: P[]; pct: P[]; rM: number; rPct: number };

const HEIGHT: Record<Figure, number> = { male: 1.78, female: 1.68 };
/** % of box width per metre across the body, for the male figure. */
const X_SCALE = 94;

function chains(figure: Figure) {
  const J = BODY_JOINTS[figure];
  const k = HEIGHT[figure] / HEIGHT.male;
  const xy = (n: keyof typeof J, side = 1): P => ({ x: J[n][0] * side, y: J[n][1] });
  const chin = J.jaw[1] - 0.035 * k;
  const groin = J.pelvis[1] - 0.08 * k;
  const list: Chain[] = [
    { m: [{ x: 0, y: chin }, { x: 0, y: HEIGHT[figure] }], pct: [{ x: 50, y: 15 }, { x: 50, y: 0 }], rM: 0.1 * k, rPct: 9 },
    {
      m: [
        { x: 0, y: chin },
        { x: 0, y: J["l-shoulder"][1] },
        { x: 0, y: J["spine-1"][1] - 0.035 * k },
        { x: 0, y: J["spine-3"][1] },
        { x: 0, y: groin },
      ],
      pct: [{ x: 50, y: 15 }, { x: 50, y: 21 }, { x: 50, y: 30 }, { x: 50, y: 42 }, { x: 50, y: 57 }],
      rM: 0.15 * k,
      rPct: 14,
    },
  ];
  for (const s of [-1, 1]) {
    // s = 1 is the figure's left (positive x in the model, right half of the front view).
    const mx = (x: number) => (s === 1 ? 100 - x : x);
    const sh = xy("l-shoulder", s);
    const el = xy("l-elbow", s);
    const wr = xy("l-hand", s);
    const len = Math.hypot(wr.x - el.x, wr.y - el.y);
    const tip = { x: wr.x + ((wr.x - el.x) / len) * 0.18 * k, y: wr.y + ((wr.y - el.y) / len) * 0.18 * k };
    list.push({
      m: [sh, el, wr, tip],
      pct: [{ x: mx(30), y: 22 }, { x: mx(21), y: 41 }, { x: mx(16), y: 52.5 }, { x: mx(16.5), y: 61 }],
      rM: 0.045 * k,
      rPct: 4,
    });
    const hip = xy("l-upper-leg", s);
    const knee = xy("l-knee", s);
    const ankle = xy("l-ankle", s);
    list.push({
      m: [hip, knee, ankle, { x: ankle.x, y: 0 }],
      pct: [{ x: mx(40), y: 54 }, { x: mx(43), y: 78 }, { x: mx(43), y: 95 }, { x: mx(43), y: 100 }],
      rM: 0.075 * k,
      rPct: 7,
    });
  }
  return { list, k };
}

/** Where p sits on the nearest chain: chain, segment, position along it, and signed sideways offset. */
function locate(p: P, list: Chain[], space: "m" | "pct") {
  let best = { score: Infinity, chain: list[0], seg: 0, t: 0, off: 0 };
  for (const c of list) {
    const pts = c[space];
    const r = space === "m" ? c.rM : c.rPct;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L2 = dx * dx + dy * dy || 1e-9;
      const raw = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
      const t = Math.min(1, Math.max(0, raw));
      const cx = a.x + dx * t;
      const cy = a.y + dy * t;
      const d = Math.hypot(p.x - cx, p.y - cy);
      // A point past the start of a chain belongs to the neighbouring chain (face vs neck, shoulder vs arm).
      const score = d - r + (i === 0 && raw < 0 ? 1e3 : 0);
      if (score < best.score) {
        // Sideways offset along the segment's normal, turned to point towards +x in both spaces.
        const L = Math.sqrt(L2);
        const flip = dy < 0 ? -1 : 1;
        const nx = (flip * dy) / L;
        const ny = (-flip * dx) / L;
        best = { score, chain: c, seg: i, t, off: (p.x - cx) * nx + (p.y - cy) * ny };
      }
    }
  }
  return best;
}

function place(chain: Chain, seg: number, t: number, off: number, space: "m" | "pct"): P {
  const pts = chain[space];
  const a = pts[seg];
  const b = pts[seg + 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1e-9;
  const flip = dy < 0 ? -1 : 1;
  const nx = (flip * dy) / L;
  const ny = (-flip * dx) / L;
  return { x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off };
}

/** A point on the 3D model (metres, x/y only) to the stored front-view position. */
export function modelToFront(figure: Figure, p: P): P {
  const { list, k } = chains(figure);
  const at = locate(p, list, "m");
  const q = place(at.chain, at.seg, at.t, at.off * (X_SCALE / k), "pct");
  return { x: Math.round(Math.min(100, Math.max(0, q.x)) * 10) / 10, y: Math.round(Math.min(100, Math.max(0, q.y)) * 10) / 10 };
}

/** A stored front-view position to x/y on the 3D model (metres). */
export function frontToModel(figure: Figure, p: P): P {
  const { list, k } = chains(figure);
  const at = locate(p, list, "pct");
  return place(at.chain, at.seg, at.t, at.off / (X_SCALE / k), "m");
}
