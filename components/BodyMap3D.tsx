"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RiskLevel } from "@/lib/risk";
import { riskLabel } from "@/lib/risk";
import type { RegionId, RegionStatus } from "@/lib/bodyMap";
import { BODY_JOINTS, BODY_MODEL_SCALE } from "@/lib/bodyModelJoints";
import { frontToModel, modelToFront } from "@/lib/bodyModelMapping";

type Figure = "male" | "female";

const LEVEL_HEX: Record<RiskLevel, number> = { GREEN: 0x3ddc97, YELLOW: 0xf5b82e, RED: 0xff5d5d };
const LEVEL_CSS: Record<RiskLevel, string> = { GREEN: "#3ddc97", YELLOW: "#f5b82e", RED: "#ff5d5d" };
const HOLO = 0x38e8ff;

/** Which side of the figure each body system's callout sits on. */
const SIDES: Record<RegionId, "left" | "right"> = {
  brain: "right",
  eyes: "left",
  lungs: "left",
  heart: "right",
  blood: "left",
  musculoskeletal: "right",
  reproductive: "right",
};

type V3 = readonly [number, number, number];
type JointName = keyof (typeof BODY_JOINTS)["male"];

/** Landmarks of the figure, in metres, taken from the model's joints. */
function landmarks(figure: Figure) {
  const J = BODY_JOINTS[figure];
  const k = J["head-2"][1] / BODY_JOINTS.male["head-2"][1]; // overall size against the male figure
  const j = (name: JointName, side = 1) => new THREE.Vector3(J[name][0] * side, J[name][1], J[name][2]);
  const chest = j("spine-1");
  const brain = new THREE.Vector3(0, J.head[1] + 0.088 * k, 0.012);
  const heart = new THREE.Vector3(0.024 * k, chest.y - 0.035 * k, 0.045 * k);
  const pelvis = j("pelvis");
  return { J, k, j, chest, brain, heart, pelvis };
}

/** Where each body system's hotspot sits on the 3D figure. */
function anchorPositions(figure: Figure): Record<RegionId, V3> {
  const { J, k, j, chest, brain, heart, pelvis } = landmarks(figure);
  const forearm = j("l-elbow", -1).lerp(j("l-hand", -1), 0.45);
  const thigh = j("l-upper-leg").lerp(j("l-knee"), 0.5);
  return {
    brain: [0, brain.y + 0.01, 0.07 * k],
    eyes: [-J["l-eye"][0], J["l-eye"][1], J["l-eye"][2] + 0.005],
    lungs: [-0.085 * k, chest.y + 0.005, 0.09 * k],
    heart: [heart.x + 0.01, heart.y, 0.11 * k],
    blood: [forearm.x, forearm.y, forearm.z + 0.02],
    musculoskeletal: [thigh.x, thigh.y, thigh.z + 0.06 * k],
    reproductive: [0, pelvis.y - 0.045 * k, 0.1 * k],
  };
}

type BodyModel = { quads: Uint16Array; male: Float32Array; female: Float32Array };
let bodyModelPromise: Promise<BodyModel> | null = null;

/** The anatomical surface mesh (public/models/body.bin, see scripts/bake-body-model.py). */
function loadBodyModel(): Promise<BodyModel> {
  bodyModelPromise ??= fetch("/models/body.bin")
    .then((r) => {
      if (!r.ok) throw new Error(`body model ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => {
      const [n, q] = new Uint32Array(buf, 0, 2);
      if (buf.byteLength !== 8 + n * 12 + q * 8) throw new Error("body model is damaged");
      const read = (offset: number) => Float32Array.from(new Int16Array(buf, offset, n * 3), (v) => v / BODY_MODEL_SCALE);
      return { male: read(8), female: read(8 + n * 6), quads: new Uint16Array(buf, 8 + n * 12, q * 4) };
    })
    .catch((e) => {
      bodyModelPromise = null;
      throw e;
    });
  return bodyModelPromise;
}

/** Surface geometry plus the quad edges, so the wireframe follows the real mesh flow. */
function bodyModelGeometry(model: BodyModel, figure: Figure) {
  const { quads } = model;
  const surface = new THREE.BufferGeometry();
  surface.setAttribute("position", new THREE.BufferAttribute(model[figure], 3));
  const tris = new Uint16Array((quads.length / 4) * 6);
  const edges: number[] = [];
  const seen = new Set<number>();
  for (let i = 0, t = 0; i < quads.length; i += 4) {
    const a = quads[i], b = quads[i + 1], c = quads[i + 2], d = quads[i + 3];
    tris[t++] = a; tris[t++] = b; tris[t++] = c;
    tris[t++] = a; tris[t++] = c; tris[t++] = d;
    for (const [u, w] of [[a, b], [b, c], [c, d], [d, a]]) {
      const key = u < w ? u * 65536 + w : w * 65536 + u;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push(u, w);
      }
    }
  }
  surface.setIndex(new THREE.BufferAttribute(tris, 1));
  surface.computeVertexNormals();
  const wire = new THREE.BufferGeometry();
  wire.setAttribute("position", surface.getAttribute("position"));
  wire.setAttribute("normal", surface.getAttribute("normal"));
  wire.setIndex(new THREE.BufferAttribute(Uint16Array.from(edges), 1));
  return { surface, wire };
}

/** Mesh lines that fade where the surface turns away, so only the near side reads clearly. */
function wireMaterial(color: number, opacity: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: `
      varying float vFacing;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFacing = dot(normalize(normalMatrix * normal), normalize(-mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity;
      varying float vFacing;
      void main() {
        float front = smoothstep(-0.15, 0.25, vFacing);
        float rim = 1.0 - clamp(vFacing, 0.0, 1.0);
        gl_FragColor = vec4(uColor, uOpacity * (0.12 + front * (0.55 + rim * 0.9)));
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Small line icons for the callouts. */
function RegionIcon({ id }: { id: RegionId }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "brain":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" {...common}>
          <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1Z" />
          <path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1" />
        </svg>
      );
    case "eyes":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" {...common}>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "heart":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" {...common}>
          <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z" />
          <path d="M5 12h3l2-3 2 5 2-2h5" />
        </svg>
      );
    case "lungs":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" {...common}>
          <path d="M12 4v8m0 0-3 2m3-2 3 2" />
          <path d="M9 8C6 8 4 13 4 17c0 2 2 3 4 2l2-1V11" />
          <path d="M15 8c3 0 5 5 5 9 0 2-2 3-4 2l-2-1v-7" />
        </svg>
      );
    case "blood":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" {...common}>
          <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
        </svg>
      );
    case "musculoskeletal":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" {...common}>
          <path d="M7 4a2 2 0 0 0-2 3 2 2 0 0 0 3 2l8 8a2 2 0 0 0 2 3 2 2 0 0 0 3-2 2 2 0 0 0-2-3 2 2 0 0 0-3 0L8 7a2 2 0 0 0-1-3Z" />
        </svg>
      );
    case "reproductive":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" {...common}>
          <circle cx="12" cy="9" r="5" />
          <path d="M12 14v7m-3-3h6" />
        </svg>
      );
  }
}

let cachedWebGL: boolean | null = null;

/** True when this browser can draw WebGL (cached and cleans up test context to prevent context limits). */
export function canUseWebGL(): boolean {
  if (typeof window === "undefined") return false;
  if (cachedWebGL !== null) return cachedWebGL;
  try {
    const c = document.createElement("canvas");
    const gl =
      c.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) ||
      c.getContext("webgl", { failIfMajorPerformanceCaveat: false }) ||
      c.getContext("experimental-webgl", { failIfMajorPerformanceCaveat: false });
    cachedWebGL = !!gl;
    if (gl && "getExtension" in gl) {
      (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    cachedWebGL = false;
  }
  return cachedWebGL;
}

/** Rim-lit translucent "hologram" surface. */
function holoMaterial(color: number, strength = 1, side: THREE.Side = THREE.DoubleSide) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uStrength;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float rim = pow(1.0 - abs(dot(vN, vV)), 2.2);
        gl_FragColor = vec4(uColor, (0.06 + rim * 0.55) * uStrength);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side,
  });
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.85)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.25)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A capsule running from a to b. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const len = a.distanceTo(b);
  const geo = new THREE.CapsuleGeometry(r, Math.max(len - r * 0.6, 0.001), 6, 12);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  geo.applyQuaternion(q);
  geo.translate(mid.x, mid.y, mid.z);
  return geo;
}

export type InjuryMarker = { id: string; x: number; y: number; color: string; pulse: boolean; healed: boolean; label: string };

type Props = {
  figure: Figure;
  regions: RegionStatus[];
  activeId: RegionId;
  dimmed: (id: RegionId) => boolean;
  onPick: (id: RegionId) => void;
  /** Report mode: tapping the body places an injury marker instead of picking a system. */
  placing: boolean;
  /** Injury markers, positioned in the front-view % space used by lib/injuries. */
  injuries: InjuryMarker[];
  selectedInjury: string | null;
  draft: { x: number; y: number; area: string } | null;
  areaLabel: (x: number, y: number) => string;
  onPlace: (x: number, y: number) => void;
  onPickInjury: (id: string) => void;
};

export function BodyMap3D({ figure, regions, activeId, dimmed, onPick, placing, injuries, selectedInjury, draft, areaLabel, onPlace, onPickInjury }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const labelRefs = useRef<Partial<Record<RegionId, HTMLButtonElement | null>>>({});
  const lineRefs = useRef<Partial<Record<RegionId, SVGPolylineElement | null>>>({});
  const dotRefs = useRef<Partial<Record<RegionId, SVGCircleElement | null>>>({});
  const resetRef = useRef<() => void>(() => {});
  const levelsRef = useRef<Record<RegionId, RiskLevel>>({} as Record<RegionId, RiskLevel>);
  const activeRef = useRef(activeId);
  const pickRef = useRef(onPick);
  const placingRef = useRef(placing);
  const injuriesRef = useRef(injuries);
  const draftRef = useRef(draft);
  const areaLabelRef = useRef(areaLabel);
  const placeRef = useRef(onPlace);
  const markerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const draftElRef = useRef<HTMLDivElement>(null);
  const hoverElRef = useRef<HTMLDivElement>(null);
  // The render loop reads the latest props through refs, so it never restarts on a status change.
  useEffect(() => {
    levelsRef.current = Object.fromEntries(regions.map((r) => [r.id, r.level])) as Record<RegionId, RiskLevel>;
    activeRef.current = activeId;
    pickRef.current = onPick;
    placingRef.current = placing;
    injuriesRef.current = injuries;
    draftRef.current = draft;
    areaLabelRef.current = areaLabel;
    placeRef.current = onPlace;
  });
  const levelKey = regions.map((r) => r.level).join(",");

  useEffect(() => {
    const host = canvasHost.current;
    const wrap = wrapRef.current;
    if (!host || !wrap) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      failIfMajorPerformanceCaveat: false,
      powerPreference: "default",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    // Close enough that the full figure fills the panel, head to feet, as in the body-map reference.
    const home = new THREE.Vector3(0, 0.95, 3.05);
    camera.position.copy(home);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.95, 0);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2.4;
    controls.maxDistance = 7;
    controls.minPolarAngle = Math.PI * 0.32;
    controls.maxPolarAngle = Math.PI * 0.62;
    controls.rotateSpeed = 0.7;
    controls.update();
    resetRef.current = () => {
      camera.position.copy(home);
      controls.target.set(0, 0.95, 0);
      controls.update();
    };

    const disposables: Array<{ dispose: () => void }> = [];
    const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

    // Body: the anatomical surface as a rim-lit shell with its mesh lines, like a hologram.
    const body = new THREE.Group();
    scene.add(body);
    let disposed = false;
    let skinMesh: THREE.Mesh | null = null;
    let skinPos: Float32Array | null = null;
    loadBodyModel()
      .then((model) => {
        if (disposed) return;
        const { surface, wire } = bodyModelGeometry(model, figure);
        track(surface);
        track(wire);
        const skin = new THREE.Mesh(surface, track(holoMaterial(HOLO, 0.5, THREE.FrontSide)));
        const back = new THREE.Mesh(surface, track(holoMaterial(HOLO, 0.16, THREE.BackSide)));
        const lines = new THREE.LineSegments(wire, track(wireMaterial(HOLO, 0.2)));
        skin.renderOrder = back.renderOrder = lines.renderOrder = -1;
        body.add(back, skin, lines);
        skinMesh = skin;
        skinPos = model[figure];
        markerCache.clear();
      })
      .catch(() => {
        // Without the surface mesh the skeleton and organs below still show.
      });

    const { J, k, j, chest, brain: brainAt, heart: heartAt, pelvis } = landmarks(figure);
    const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
    const ellipsoid = (r: number, sx: number, sy: number, sz: number, at: THREE.Vector3, seg = 20) => {
      const g = new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75));
      g.scale(sx, sy, sz);
      g.translate(at.x, at.y, at.z);
      return g;
    };
    const tube = (pts: THREE.Vector3[], r: number, seg = 24) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 6);

    // Organs and bones tinted by each system's status.
    const organMats: Partial<Record<RegionId, THREE.ShaderMaterial>> = {};
    const organ = (id: RegionId, geo: THREE.BufferGeometry, strength = 1.6) => {
      const base = (organMats[id] ??= track(holoMaterial(LEVEL_HEX[levelsRef.current[id] ?? "GREEN"], 1)));
      // One colour per system, but each part keeps its own brightness.
      const m = track(base.clone());
      m.uniforms.uColor = base.uniforms.uColor;
      m.uniforms.uStrength.value = strength;
      track(geo);
      const mesh = new THREE.Mesh(geo, m);
      body.add(mesh);
      return mesh;
    };

    // Brain: two hemispheres, a cerebellum and the brain stem.
    for (const s of [-1, 1]) organ("brain", ellipsoid(0.07 * k, 0.5, 0.78, 1.08, v(s * 0.031 * k, brainAt.y, brainAt.z)), 1.05);
    organ("brain", ellipsoid(0.034 * k, 1.3, 0.75, 0.9, v(0, brainAt.y - 0.05 * k, brainAt.z - 0.045 * k), 14), 1.3);
    organ("brain", limb(v(0, brainAt.y - 0.04 * k, brainAt.z - 0.012 * k), v(0, J.neck[1] + 0.03 * k, -0.02 * k), 0.009 * k), 1.3);
    for (const s of [-1, 1]) organ("eyes", ellipsoid(0.0125 * k, 1, 1, 1, v(s * J["l-eye"][0], J["l-eye"][1], J["l-eye"][2] - 0.012 * k), 12), 2.6);

    // Lungs taper towards the top and curve around the heart; windpipe between them.
    for (const s of [-1, 1]) {
      const lung = new THREE.SphereGeometry(0.068 * k, 22, 18);
      const pos = lung.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const t = pos.getY(i) / (0.068 * k); // -1 bottom .. 1 top
        const taper = 1 - 0.38 * Math.max(0, t) - 0.08 * Math.max(0, -t);
        pos.setX(i, pos.getX(i) * taper);
        pos.setZ(i, pos.getZ(i) * (1 - 0.3 * Math.max(0, t)));
      }
      lung.scale(0.82, 1.65, 0.95);
      lung.computeVertexNormals();
      lung.translate(s * 0.074 * k, chest.y - 0.012 * k, -0.002);
      organ("lungs", lung, 1.05);
      organ("lungs", tube([v(0, chest.y + 0.075 * k, 0.012), v(s * 0.02 * k, chest.y + 0.045 * k, 0.008), v(s * 0.05 * k, chest.y + 0.02 * k, 0.004)], 0.006 * k, 10), 1.5);
    }
    organ("lungs", limb(v(0, chest.y + 0.075 * k, 0.012), v(0, J.neck[1] + 0.02 * k, 0.03 * k), 0.0085 * k), 1.4);

    // Heart, tilted with its tip to the left.
    const heartGeo = new THREE.SphereGeometry(0.042 * k, 20, 16);
    {
      const pos = heartGeo.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const t = pos.getY(i) / (0.042 * k);
        const taper = 1 - 0.42 * Math.max(0, -t);
        pos.setX(i, pos.getX(i) * taper);
        pos.setZ(i, pos.getZ(i) * taper);
      }
      heartGeo.scale(0.95, 1.2, 0.85);
      heartGeo.rotateZ(0.55);
      heartGeo.computeVertexNormals();
    }
    const heartMesh = organ("heart", heartGeo, 2.3);
    heartMesh.position.copy(heartAt);

    // Kidneys and the pelvic organs.
    const loin = j("spine-3");
    for (const s of [-1, 1]) organ("reproductive", ellipsoid(0.027 * k, 0.72, 1.3, 0.7, v(s * 0.062 * k, loin.y + 0.03 * k, -0.035 * k), 12), 1.1);
    organ("reproductive", ellipsoid(0.038 * k, 1.05, 0.8, 0.85, v(0, pelvis.y - 0.05 * k, 0.045 * k), 16), 1.4);

    // Skeleton. Bones follow the model's own joints.
    const BONE = 0.72; // overall bone brightness, so the skeleton sits inside the body rather than over it
    const bone = (a: THREE.Vector3, b: THREE.Vector3, r: number, strength = 1.5, knob = 1.45) => {
      organ("musculoskeletal", limb(a, b, r), strength * BONE);
      for (const end of [a, b]) organ("musculoskeletal", ellipsoid(r * knob, 1, 1, 1, end, 10), strength * BONE);
    };
    // Spine: a column of vertebrae along the back.
    const spineCurve = new THREE.CatmullRomCurve3([
      v(0, J.head[1] - 0.005, -0.012 * k),
      v(0, J.neck[1], -0.03 * k),
      v(0, chest.y + 0.04 * k, -0.07 * k),
      v(0, J["spine-2"][1], -0.078 * k),
      v(0, J["spine-3"][1], -0.055 * k),
      v(0, J["spine-4"][1] - 0.01 * k, -0.045 * k),
      v(0, pelvis.y - 0.05 * k, -0.07 * k),
    ]);
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      organ("musculoskeletal", ellipsoid((0.0085 + 0.0065 * Math.min(1, t * 1.4)) * k, 1.25, 0.62, 1, spineCurve.getPoint(t), 10), 1.1);
    }
    // Rib cage: ribs sweep from the spine round to the breastbone, sloping down at the front.
    const ribTop = chest.y + 0.085 * k;
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      const y = ribTop - t * 0.235 * k;
      const a = (0.062 + 0.068 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62)) * k; // half width
      const b = (0.05 + 0.04 * Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.6)) * k; // half depth
      const sweep = i < 7 ? 0.93 : 0.93 - (i - 6) * 0.13; // lower ribs stop short of the front
      for (const s of [-1, 1]) {
        const pts: THREE.Vector3[] = [];
        for (let n = 0; n <= 12; n++) {
          const th = (n / 12) * Math.PI * sweep;
          pts.push(v(s * a * Math.sin(th), y - 0.045 * k * (1 - Math.cos(th)) * 0.5 - (n / 12) * 0.012 * k, -0.012 * k - b * Math.cos(th)));
        }
        organ("musculoskeletal", tube(pts, 0.0042 * k, 20), 0.95);
      }
    }
    bone(v(0, ribTop - 0.035 * k, 0.03 * k), v(0, ribTop - 0.19 * k, 0.068 * k), 0.008 * k, 1.3, 1.1); // breastbone
    // Pelvis: hip blades, sacrum and the front arch.
    for (const s of [-1, 1]) {
      const hipJ = j("l-upper-leg", s);
      organ(
        "musculoskeletal",
        tube([v(s * 0.02 * k, pelvis.y + 0.02 * k, -0.07 * k), v(s * 0.09 * k, pelvis.y + 0.075 * k, -0.045 * k), v(s * 0.135 * k, pelvis.y + 0.07 * k, 0.01), v(s * 0.115 * k, pelvis.y + 0.03 * k, 0.055 * k), v(hipJ.x * 0.9, hipJ.y + 0.01, 0.03 * k), v(s * 0.035 * k, hipJ.y - 0.06 * k, 0.05 * k), v(0, hipJ.y - 0.055 * k, 0.058 * k)], 0.0085 * k, 40),
        1.4
      );
      organ("musculoskeletal", tube([v(s * 0.02 * k, pelvis.y - 0.03 * k, -0.07 * k), v(s * 0.075 * k, hipJ.y - 0.03 * k, -0.03 * k), v(s * 0.05 * k, hipJ.y - 0.085 * k, 0.015 * k), v(s * 0.02 * k, hipJ.y - 0.07 * k, 0.05 * k)], 0.0075 * k, 24), 1.2);
    }
    for (const s of [-1, 1]) {
      const sh = j("l-shoulder", s), el = j("l-elbow", s), wr = j("l-hand", s), hd = j("l-hand-2", s);
      const hipJ = j("l-upper-leg", s), kn = j("l-knee", s), an = j("l-ankle", s);
      bone(j("l-clavicle", s), v(sh.x * 0.93, sh.y + 0.012 * k, sh.z), 0.0062 * k, 1.4, 1.2); // collarbone
      organ("musculoskeletal", ellipsoid(0.03 * k, 1, 1.25, 0.35, v(sh.x * 0.62, sh.y - 0.055 * k, -0.085 * k), 12), 0.9); // shoulder blade
      bone(sh, el, 0.0105 * k, 1.6); // humerus
      const fore = wr.clone().sub(el).normalize();
      const across = new THREE.Vector3().crossVectors(fore, v(0, 0, 1)).normalize().multiplyScalar(0.011 * k);
      bone(el.clone().add(across), wr.clone().add(across), 0.0062 * k, 1.5, 1.4); // radius
      bone(el.clone().sub(across), wr.clone().sub(across), 0.0058 * k, 1.5, 1.4); // ulna
      const palm = hd.clone().sub(wr).normalize();
      for (let f = -2; f <= 2; f++) {
        const spread = across.clone().multiplyScalar(f * 0.85);
        const a = wr.clone().addScaledVector(palm, 0.02 * k).addScaledVector(spread, 0.6);
        organ("musculoskeletal", limb(a, wr.clone().addScaledVector(palm, (0.15 - Math.abs(f) * 0.012) * k).addScaledVector(spread, 1.6), 0.0032 * k), 1.3);
      }
      // Thigh bone with its neck angling in to the hip socket (it glows brightest, as the callout points here).
      const troch = v(hipJ.x + s * 0.045 * k, hipJ.y - 0.035 * k, hipJ.z - 0.005);
      bone(hipJ, troch, 0.011 * k, 2, 1.5);
      bone(troch, kn, 0.0135 * k, 2.4, 1.6);
      organ("musculoskeletal", ellipsoid(0.019 * k, 1, 1.1, 0.6, v(kn.x, kn.y + 0.005, kn.z + 0.042 * k), 12), 1.6); // kneecap
      bone(v(kn.x - s * 0.004, kn.y - 0.02 * k, kn.z), v(an.x - s * 0.006, an.y + 0.01, an.z), 0.0115 * k, 1.7, 1.55); // shin bone
      bone(v(kn.x + s * 0.03 * k, kn.y - 0.035 * k, kn.z - 0.012 * k), v(an.x + s * 0.024 * k, an.y + 0.005, an.z - 0.008 * k), 0.0052 * k, 1.3, 1.3); // fibula
      const f1 = j("l-foot-1", s), f2 = j("l-foot-2", s);
      organ("musculoskeletal", ellipsoid(0.022 * k, 0.9, 0.8, 1.5, v(an.x, an.y - 0.04 * k, an.z - 0.02 * k), 12), 1.3); // heel
      for (let f = -2; f <= 2; f++) {
        organ("musculoskeletal", limb(v(an.x + f * 0.006 * k, an.y - 0.02 * k, an.z + 0.02 * k), v(f1.x + f * 0.017 * k, f1.y + 0.012 * k, f1.z + (f2.z - f1.z) * (0.8 - Math.abs(f - 1) * 0.08)), 0.0036 * k), 1.3);
      }
    }
    // Blood: the aorta arching off the heart, with arteries to the head, arms and legs.
    const arch = v(0.012 * k, heartAt.y + 0.075 * k, 0.02 * k);
    organ("blood", tube([heartAt.clone().add(v(0, 0.03 * k, 0)), arch, v(-0.012 * k, heartAt.y + 0.04 * k, -0.035 * k), v(-0.006 * k, J["spine-2"][1], -0.04 * k), v(0, J["spine-4"][1], -0.02 * k)], 0.0075 * k, 32), 2);
    for (const s of [-1, 1]) {
      const sh = j("l-shoulder", s), el = j("l-elbow", s), wr = j("l-hand", s), hd = j("l-hand-2", s);
      const hipJ = j("l-upper-leg", s), kn = j("l-knee", s), an = j("l-ankle", s);
      organ("blood", tube([arch, v(s * 0.022 * k, J.neck[1] - 0.01, 0.025 * k), v(s * 0.034 * k, J.head[1] - 0.01, 0.03 * k), v(s * 0.045 * k, brainAt.y - 0.02 * k, 0.035 * k)], 0.0042 * k, 20), 2);
      organ("blood", tube([arch, v(sh.x * 0.55, sh.y + 0.005, 0.03 * k), v(sh.x * 0.96, sh.y - 0.03 * k, 0.012 * k), el.clone().add(v(-s * 0.012 * k, 0, 0.014 * k)), wr.clone().add(v(-s * 0.006 * k, 0, 0.01 * k)), hd.clone().lerp(wr, -0.6)], 0.0044 * k, 40), 2.1);
      organ("blood", tube([v(0, J["spine-4"][1], -0.02 * k), v(hipJ.x * 0.6, hipJ.y + 0.01, 0.03 * k), hipJ.clone().lerp(kn, 0.5).add(v(-s * 0.025 * k, 0, 0.03 * k)), kn.clone().add(v(-s * 0.006 * k, 0, -0.03 * k)), an.clone().add(v(-s * 0.014 * k, 0.03 * k, -0.006 * k)), j("l-foot-1", s).add(v(0, 0.03 * k, -0.02 * k))], 0.005 * k, 48), 2.1);
    }

    // Platform rings under the feet.
    const rings = new THREE.Group();
    scene.add(rings);
    for (const [r, w, o] of [[0.38, 0.006, 0.7], [0.5, 0.004, 0.45], [0.62, 0.012, 0.25], [0.75, 0.003, 0.35]] as const) {
      const g = track(new THREE.RingGeometry(r, r + w, 96));
      const m = track(new THREE.MeshBasicMaterial({ color: HOLO, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const ring = new THREE.Mesh(g, m);
      ring.rotation.x = -Math.PI / 2;
      rings.add(ring);
    }
    const arcG = track(new THREE.RingGeometry(0.56, 0.585, 64, 1, 0, Math.PI * 0.6));
    const arcM = track(new THREE.MeshBasicMaterial({ color: HOLO, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const arc = new THREE.Mesh(arcG, arcM);
    arc.rotation.x = -Math.PI / 2;
    rings.add(arc);
    rings.position.y = 0.005;

    // Scan ring sweeping up and down the body.
    const scanG = track(new THREE.RingGeometry(0.4, 0.405, 96));
    const scanM = track(new THREE.MeshBasicMaterial({ color: HOLO, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const scan = new THREE.Mesh(scanG, scanM);
    scan.rotation.x = -Math.PI / 2;
    scene.add(scan);

    // Hotspots: glowing sprites coloured by status.
    const tex = track(glowTexture());
    const sprites = new Map<RegionId, THREE.Sprite>();
    const anchors = anchorPositions(figure);
    for (const id of Object.keys(anchors) as RegionId[]) {
      const m = track(new THREE.SpriteMaterial({ map: tex, color: LEVEL_HEX[levelsRef.current[id] ?? "GREEN"], transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
      const s = new THREE.Sprite(m);
      s.position.set(...anchors[id]);
      s.userData.id = id;
      s.renderOrder = 10;
      body.add(s);
      sprites.set(id, s);
    }

    // Injury markers sit on the skin: find the surface point in front of a stored front-view spot.
    const markerCache = new Map<string, THREE.Vector3>();
    const frontRay = new THREE.Raycaster();
    const markerPos = (x: number, y: number) => {
      const key = `${x}:${y}`;
      const hit = markerCache.get(key);
      if (hit) return hit;
      const m = frontToModel(figure, { x, y });
      let p = new THREE.Vector3(m.x, m.y, 0.12);
      if (skinMesh) {
        frontRay.set(new THREE.Vector3(m.x, m.y, 3), new THREE.Vector3(0, 0, -1));
        const h = frontRay.intersectObject(skinMesh)[0];
        if (h) p = h.point.clone();
        else if (skinPos) {
          // Between the limbs: snap to the nearest point of the skin.
          let best = Infinity;
          for (let i = 0; i < skinPos.length; i += 3) {
            const d = (skinPos[i] - m.x) ** 2 + (skinPos[i + 1] - m.y) ** 2 - skinPos[i + 2] * 0.01;
            if (d < best) {
              best = d;
              p = new THREE.Vector3(skinPos[i], skinPos[i + 1], skinPos[i + 2]);
            }
          }
        }
        markerCache.set(key, p);
      }
      return p;
    };

    // Report mode: a ring follows the pointer over the skin and shows the area underneath.
    const cursorM = track(new THREE.SpriteMaterial({ map: tex, color: 0x9ff3ff, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
    const cursor = new THREE.Sprite(cursorM);
    cursor.scale.setScalar(0.07);
    cursor.renderOrder = 11;
    cursor.visible = false;
    body.add(cursor);
    let hoverAt: THREE.Vector3 | null = null;

    // Click a hotspot to pick it, or the skin to place an injury (ignoring drags).
    const ray = new THREE.Raycaster();
    const ndc = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const skinHit = (e: PointerEvent) => {
      if (!skinMesh) return null;
      ray.setFromCamera(ndc(e), camera);
      return ray.intersectObject(skinMesh)[0]?.point ?? null;
    };
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onMove = (e: PointerEvent) => {
      hoverAt = placingRef.current && !e.buttons ? skinHit(e) : null;
    };
    const onLeave = () => (hoverAt = null);
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      if (placingRef.current) {
        const p = skinHit(e);
        if (p) {
          const f = modelToFront(figure, p);
          placeRef.current(f.x, f.y);
        }
        return;
      }
      ray.setFromCamera(ndc(e), camera);
      const hit = ray.intersectObjects([...sprites.values()])[0];
      if (hit) pickRef.current(hit.object.userData.id as RegionId);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerleave", onLeave);

    let w = 0;
    let h = 0;
    const resize = () => {
      w = wrap.clientWidth;
      h = wrap.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / h;
      // Keep the whole figure in view on narrow screens.
      camera.fov = w / h < 0.75 ? 38 : 30;
      camera.updateProjectionMatrix();
      svgRef.current?.setAttribute("viewBox", `0 0 ${w} ${h}`);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const tmp = new THREE.Vector3();
    const center = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      controls.update();
      rings.rotation.y = t * 0.25;
      arc.rotation.z = -t * 0.8;
      scan.position.y = 0.9 + Math.sin(t * 0.7) * 0.9;
      const beat = 1 + Math.max(0, Math.sin(t * 7)) * 0.08;
      heartMesh.scale.setScalar(beat);

      // Recolour organs and hotspots when a status changes.
      for (const [id, m] of Object.entries(organMats) as Array<[RegionId, THREE.ShaderMaterial]>) {
        m.uniforms.uColor.value.setHex(LEVEL_HEX[levelsRef.current[id] ?? "GREEN"]);
      }

      const placingNow = placingRef.current;
      renderer.domElement.style.cursor = placingNow ? (hoverAt ? "crosshair" : "grab") : "";

      // Screen position of a point on the body, and whether it faces the camera.
      const toScreen = (p: THREE.Vector3) => {
        tmp.copy(p);
        body.localToWorld(tmp);
        center.set(0, tmp.y, 0);
        toCam.copy(camera.position).sub(center);
        const facing = tmp.clone().sub(center).dot(toCam) >= -0.002;
        tmp.project(camera);
        return { x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, facing };
      };

      // Injury markers and the one being placed.
      for (const m of injuriesRef.current) {
        const el = markerRefs.current[m.id];
        if (!el) continue;
        const s = toScreen(markerPos(m.x, m.y));
        el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
        el.style.visibility = "visible";
        el.style.opacity = s.facing ? "" : "0.35";
      }
      const dEl = draftElRef.current;
      const d = draftRef.current;
      if (dEl) {
        if (d) {
          const s = toScreen(markerPos(d.x, d.y));
          dEl.style.transform = `translate(${s.x}px, ${s.y}px)`;
          dEl.style.visibility = "visible";
          dEl.style.opacity = s.facing ? "" : "0.5";
        } else dEl.style.visibility = "hidden";
      }
      const hEl = hoverElRef.current;
      cursor.visible = !!hoverAt;
      if (hoverAt) {
        cursor.position.copy(hoverAt);
        cursor.scale.setScalar(0.06 + Math.sin(t * 6) * 0.008);
      }
      if (hEl) {
        if (hoverAt) {
          const s = toScreen(hoverAt);
          const f = modelToFront(figure, hoverAt);
          hEl.textContent = areaLabelRef.current(f.x, f.y);
          const flip = s.x > w * 0.6;
          hEl.style.transform = `translate(${s.x + (flip ? -14 : 14)}px, ${s.y}px) translate(${flip ? "-100%" : "0"}, -50%)`;
          hEl.style.visibility = "visible";
        } else hEl.style.visibility = "hidden";
      }

      // Callouts: project each hotspot to the screen and draw a leader line to its label.
      const labelsLeft: Array<[RegionId, number, number, boolean]> = [];
      const labelsRight: Array<[RegionId, number, number, boolean]> = [];
      for (const [id, s] of sprites) {
        const lv = levelsRef.current[id] ?? "GREEN";
        (s.material as THREE.SpriteMaterial).color.setHex(LEVEL_HEX[lv]);
        const on = activeRef.current === id;
        const pulse = lv === "GREEN" ? 1 : 1 + Math.sin(t * 5) * 0.25;
        s.scale.setScalar((on ? 0.11 : 0.085) * pulse);
        s.visible = !placingNow;
        s.getWorldPosition(tmp);
        center.set(0, tmp.y, 0);
        toCam.copy(camera.position).sub(center);
        const facing = tmp.clone().sub(center).dot(toCam) >= -0.002;
        tmp.project(camera);
        const x = (tmp.x * 0.5 + 0.5) * w;
        const y = (-tmp.y * 0.5 + 0.5) * h;
        (SIDES[id] === "left" ? labelsLeft : labelsRight).push([id, x, y, facing]);
      }
      const place = (list: Array<[RegionId, number, number, boolean]>, side: "left" | "right") => {
        list.sort((a, b) => a[2] - b[2]);
        const gap = 64;
        let prev = -Infinity;
        const top = 34;
        const bottom = h - 34;
        const ys = list.map(([, , y]) => {
          const yy = Math.min(Math.max(y, top, prev + gap), bottom);
          prev = yy;
          return yy;
        });
        // Push back up if the bottom ran out of room.
        for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap);
        list.forEach(([id, x, y, facing], i) => {
          const el = labelRefs.current[id];
          const line = lineRefs.current[id];
          const dot = dotRefs.current[id];
          if (!el || !line || !dot) return;
          // While placing an injury the callouts step aside so the whole body is free to tap.
          el.style.visibility = placingNow ? "hidden" : "visible";
          line.style.visibility = dot.style.visibility = placingNow ? "hidden" : "visible";
          if (placingNow) return;
          const ly = ys[i];
          const lw = el.offsetWidth;
          const lx = side === "left" ? 8 : w - lw - 8;
          el.style.transform = `translate(${lx}px, ${ly - el.offsetHeight / 2}px)`;
          el.style.opacity = facing ? "" : "0.45";
          const edge = side === "left" ? lx + lw : lx;
          const elbow = side === "left" ? Math.min(x - 18, edge + 24) : Math.max(x + 18, edge - 24);
          line.setAttribute("points", `${edge},${ly} ${elbow},${ly} ${x},${y}`);
          line.style.opacity = facing ? "0.85" : "0.25";
          dot.setAttribute("cx", String(x));
          dot.setAttribute("cy", String(y));
          dot.style.opacity = facing ? "1" : "0.3";
        });
      };
      place(labelsLeft, "left");
      place(labelsRight, "right");
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      controls.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [figure]);

  return (
    <div
      ref={wrapRef}
      className={`relative h-[560px] w-full select-none overflow-hidden rounded-xl border border-cyan-400/30 bg-[radial-gradient(ellipse_at_50%_35%,#0d2a3f_0%,#071423_55%,#050b16_100%)] shadow-[inset_0_0_40px_rgba(56,232,255,0.08)] sm:h-[620px] ${placing ? "ring-2 ring-cyan-400/60" : ""}`}
      data-levels={levelKey}
    >
      {/* faint grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: "linear-gradient(#38e8ff 1px, transparent 1px), linear-gradient(90deg, #38e8ff 1px, transparent 1px)", backgroundSize: "28px 28px" }}
        aria-hidden
      />
      <div ref={canvasHost} className="absolute inset-0" aria-label="3D body model. Drag to rotate, scroll to zoom." role="img" />
      <svg ref={svgRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        {regions.map((r) => (
          <g key={r.id} className={dimmed(r.id) ? "opacity-25" : ""}>
            <polyline
              ref={(el) => {
                lineRefs.current[r.id] = el;
              }}
              fill="none"
              stroke={LEVEL_CSS[r.level]}
              strokeWidth={activeId === r.id ? 1.6 : 1}
            />
            <circle
              ref={(el) => {
                dotRefs.current[r.id] = el;
              }}
              r={activeId === r.id ? 4 : 3}
              fill="none"
              stroke={LEVEL_CSS[r.level]}
              strokeWidth="1.5"
            />
          </g>
        ))}
      </svg>
      {regions.map((r) => {
        const on = activeId === r.id;
        const first = r.readings.find((rd) => rd.value !== "not done today") ?? r.readings[0];
        return (
          <button
            key={r.id}
            ref={(el) => {
              labelRefs.current[r.id] = el;
            }}
            type="button"
            onClick={() => onPick(r.id)}
            aria-pressed={on}
            aria-label={`${r.name}: ${riskLabel(r.level)}`}
            className={`absolute left-0 top-0 flex w-[min(31%,180px)] items-center gap-2 rounded-lg border px-2 py-1.5 text-left backdrop-blur-sm transition-[background-color,border-color,opacity] ${
              SIDES[r.id] === "right" ? "flex-row-reverse text-right" : ""
            } ${on ? "border-white/70 bg-white/10" : "bg-[#06121f]/70 hover:brightness-125"} ${dimmed(r.id) ? "!opacity-25" : ""}`}
            style={{ borderColor: on ? undefined : LEVEL_CSS[r.level], visibility: "hidden" }}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2"
              style={{ borderColor: LEVEL_CSS[r.level], color: LEVEL_CSS[r.level], boxShadow: `0 0 12px ${LEVEL_CSS[r.level]}66` }}
            >
              <RegionIcon id={r.id} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold leading-tight text-white">{r.name}</span>
              {first && (
                <span className="block truncate font-mono text-[10px] leading-tight text-cyan-100/70">
                  {first.label}: {first.value}
                </span>
              )}
              <span className="block font-mono text-[10px] font-semibold leading-tight" style={{ color: LEVEL_CSS[r.level] }}>
                {riskLabel(r.level)}
              </span>
            </span>
          </button>
        );
      })}
      {injuries.map((m) => (
        <button
          key={m.id}
          ref={(el) => {
            markerRefs.current[m.id] = el;
          }}
          type="button"
          aria-label={m.label}
          title={m.label}
          onClick={() => onPickInjury(m.id)}
          className={`absolute left-0 top-0 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] text-slate-900 shadow transition-opacity ${
            selectedInjury === m.id ? "border-white" : "border-black/50"
          } ${m.healed ? "opacity-50" : ""} ${placing ? "pointer-events-none !opacity-40" : ""}`}
          style={{ background: m.color, visibility: "hidden" }}
        >
          {m.pulse && <span className="absolute inset-0 animate-ping rounded-full opacity-50" style={{ background: m.color }} />}
          <span className="relative">✚</span>
        </button>
      ))}
      <div ref={draftElRef} className="pointer-events-none absolute left-0 top-0 z-10" style={{ visibility: "hidden" }} aria-hidden>
        <span className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-2 border-dashed border-cyan-300 bg-cyan-300/20" />
        {draft && (
          <span className="absolute left-4 -translate-y-1/2 whitespace-nowrap rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-900">{draft.area}</span>
        )}
      </div>
      <div
        ref={hoverElRef}
        className="pointer-events-none absolute left-0 top-0 z-20 whitespace-nowrap rounded bg-cyan-400 px-2 py-0.5 text-[11px] font-semibold text-slate-900"
        style={{ visibility: "hidden" }}
        aria-hidden
      />
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-200/60">
        {placing ? "Tap where it hurts · drag to turn" : "Drag to rotate · scroll to zoom"}
      </div>
      <button
        type="button"
        onClick={() => resetRef.current()}
        className="absolute bottom-2 right-2 rounded-md border border-cyan-400/30 bg-[#06121f]/70 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-cyan-100/80 hover:border-cyan-300/70"
      >
        Reset view
      </button>
    </div>
  );
}
