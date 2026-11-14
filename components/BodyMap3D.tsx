"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RiskLevel } from "@/lib/risk";
import { riskLabel } from "@/lib/risk";
import type { RegionId, RegionStatus } from "@/lib/bodyMap";

type Figure = "male" | "female";

const LEVEL_HEX: Record<RiskLevel, number> = { GREEN: 0x3ddc97, YELLOW: 0xf5b82e, RED: 0xff5d5d };
const LEVEL_CSS: Record<RiskLevel, string> = { GREEN: "#3ddc97", YELLOW: "#f5b82e", RED: "#ff5d5d" };
const HOLO = 0x38e8ff;

/** Where each body system's hotspot sits on the 3D figure, and which side its callout goes. */
const ANCHORS: Record<RegionId, { pos: [number, number, number]; side: "left" | "right" }> = {
  brain: { pos: [0, 1.71, 0.05], side: "right" },
  eyes: { pos: [-0.035, 1.655, 0.1], side: "left" },
  lungs: { pos: [-0.085, 1.33, 0.085], side: "left" },
  heart: { pos: [0.045, 1.29, 0.1], side: "right" },
  blood: { pos: [-0.275, 1.13, 0.02], side: "left" },
  musculoskeletal: { pos: [0.105, 0.66, 0.075], side: "right" },
  reproductive: { pos: [0, 0.875, 0.1], side: "right" },
};

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

/** True when this browser can draw WebGL. */
export function canUseWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Rim-lit translucent "hologram" surface. */
function holoMaterial(color: number, strength = 1) {
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
    side: THREE.DoubleSide,
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
  const geo = new THREE.CapsuleGeometry(r, Math.max(len - r * 0.6, 0.001), 8, 18);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  geo.applyQuaternion(q);
  geo.translate(mid.x, mid.y, mid.z);
  return geo;
}

function lathe(profile: Array<[number, number]>, depth: number, segments = 28) {
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  geo.scale(1, 1, depth);
  return geo;
}

/** The figure built from simple solids, in metres (feet at y = 0). */
function bodyGeometries(figure: Figure) {
  const f = figure === "female";
  const sh = f ? 0.175 : 0.2; // shoulder half-width
  const hip = f ? 0.105 : 0.09;
  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  const geos: THREE.BufferGeometry[] = [];

  const head = new THREE.SphereGeometry(0.105, 28, 20);
  head.scale(0.88, 1.15, 0.98);
  head.translate(0, 1.665, 0.005);
  geos.push(head);
  geos.push(limb(v(0, 1.56), v(0, 1.47), f ? 0.042 : 0.05)); // neck

  // Torso from waist to shoulders, slightly flattened front to back.
  geos.push(
    lathe(
      f
        ? [[0.0, 0.96], [0.115, 0.97], [0.105, 1.07], [0.12, 1.18], [0.15, 1.28], [0.155, 1.36], [0.15, 1.43], [0.1, 1.47], [0.045, 1.49], [0, 1.49]]
        : [[0.0, 0.96], [0.135, 0.97], [0.14, 1.07], [0.15, 1.18], [0.17, 1.28], [0.18, 1.36], [0.175, 1.43], [0.11, 1.48], [0.05, 1.5], [0, 1.5]],
      0.62
    )
  );
  // Pelvis
  geos.push(
    lathe(
      f
        ? [[0, 0.8], [0.1, 0.81], [0.16, 0.86], [0.17, 0.92], [0.13, 0.98], [0, 0.99]]
        : [[0, 0.8], [0.1, 0.81], [0.15, 0.86], [0.155, 0.92], [0.14, 0.98], [0, 0.99]],
      0.68
    )
  );
  if (f) {
    for (const s of [-1, 1]) {
      const b = new THREE.SphereGeometry(0.06, 20, 14);
      b.scale(1, 0.9, 0.8);
      b.translate(s * 0.07, 1.3, 0.075);
      geos.push(b);
    }
  }
  for (const s of [-1, 1]) {
    const shoulder = v(s * sh, 1.42);
    const elbow = v(s * (sh + 0.07), 1.15, -0.01);
    const wrist = v(s * (sh + 0.12), 0.9, 0.02);
    const j = new THREE.SphereGeometry(0.058, 18, 14);
    j.translate(shoulder.x, shoulder.y, 0);
    geos.push(j);
    geos.push(limb(shoulder, elbow, f ? 0.04 : 0.047));
    geos.push(limb(elbow, wrist, f ? 0.033 : 0.038));
    const hand = new THREE.SphereGeometry(0.045, 16, 12);
    hand.scale(0.7, 1.5, 0.45);
    hand.translate(wrist.x + s * 0.01, wrist.y - 0.075, wrist.z);
    geos.push(hand);

    const hipJ = v(s * hip, 0.86);
    const knee = v(s * (hip + 0.02), 0.48, 0.01);
    const ankle = v(s * (hip + 0.03), 0.08);
    geos.push(limb(hipJ, knee, f ? 0.068 : 0.072));
    geos.push(limb(knee, ankle, f ? 0.048 : 0.052));
    const foot = new THREE.SphereGeometry(0.05, 16, 10);
    foot.scale(0.8, 0.5, 2);
    foot.translate(ankle.x, 0.035, 0.06);
    geos.push(foot);
  }
  return geos;
}

type Props = {
  figure: Figure;
  regions: RegionStatus[];
  activeId: RegionId;
  dimmed: (id: RegionId) => boolean;
  onPick: (id: RegionId) => void;
};

export function BodyMap3D({ figure, regions, activeId, dimmed, onPick }: Props) {
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
  // The render loop reads the latest props through refs, so it never restarts on a status change.
  useEffect(() => {
    levelsRef.current = Object.fromEntries(regions.map((r) => [r.id, r.level])) as Record<RegionId, RiskLevel>;
    activeRef.current = activeId;
    pickRef.current = onPick;
  });
  const levelKey = regions.map((r) => r.level).join(",");

  useEffect(() => {
    const host = canvasHost.current;
    const wrap = wrapRef.current;
    if (!host || !wrap) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    const home = new THREE.Vector3(0, 0.95, 5.2);
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

    // Body: translucent rim-lit skin plus a wireframe mesh, like a hologram.
    const body = new THREE.Group();
    scene.add(body);
    const skin = track(holoMaterial(HOLO, 0.55));
    const wire = track(new THREE.LineBasicMaterial({ color: HOLO, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    for (const g of bodyGeometries(figure)) {
      track(g);
      body.add(new THREE.Mesh(g, skin));
      const w = track(new THREE.WireframeGeometry(g));
      body.add(new THREE.LineSegments(w, wire));
    }

    // Organs and bones tinted by each system's status.
    const organMats: Partial<Record<RegionId, THREE.ShaderMaterial[]>> = {};
    const organ = (id: RegionId, geo: THREE.BufferGeometry, strength = 1.6) => {
      const m = track(holoMaterial(LEVEL_HEX[levelsRef.current[id] ?? "GREEN"], strength));
      (organMats[id] ??= []).push(m);
      track(geo);
      const mesh = new THREE.Mesh(geo, m);
      body.add(mesh);
      return mesh;
    };
    const brain = new THREE.SphereGeometry(0.075, 24, 16);
    brain.scale(0.95, 0.8, 1.1);
    brain.translate(0, 1.705, -0.005);
    organ("brain", brain);
    for (const s of [-1, 1]) {
      const eye = new THREE.SphereGeometry(0.014, 12, 10);
      eye.translate(s * 0.035, 1.655, 0.085);
      organ("eyes", eye, 2.4);
      const lung = new THREE.SphereGeometry(0.07, 20, 16);
      lung.scale(0.8, 1.4, 0.75);
      lung.translate(s * 0.075, 1.32, 0.02);
      organ("lungs", lung, 1.2);
      const kidney = new THREE.SphereGeometry(0.028, 12, 10);
      kidney.scale(0.7, 1.2, 0.7);
      kidney.translate(s * 0.065, 1.06, -0.04);
      organ("reproductive", kidney, 1);
    }
    const heart = new THREE.SphereGeometry(0.045, 20, 16);
    heart.scale(0.9, 1.1, 0.85);
    heart.rotateZ(-0.4);
    heart.translate(0.03, 1.29, 0.055);
    const heartMesh = organ("heart", heart, 2.2);
    const pelvisOrgan = new THREE.SphereGeometry(0.04, 16, 12);
    pelvisOrgan.scale(1, 0.8, 0.8);
    pelvisOrgan.translate(0, 0.88, 0.04);
    organ("reproductive", pelvisOrgan, 1.4);
    // Skeleton: spine and both femurs (the femur glows like the reference image).
    const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
    organ("musculoskeletal", limb(v(0, 1.47, -0.04), v(0, 0.9, -0.04), 0.012), 1.4);
    const hip = figure === "female" ? 0.105 : 0.09;
    for (const s of [-1, 1]) {
      organ("musculoskeletal", limb(v(s * hip, 0.84), v(s * (hip + 0.02), 0.5, 0.01), 0.018), 2);
      organ("musculoskeletal", limb(v(s * (hip + 0.02), 0.46, 0.01), v(s * (hip + 0.03), 0.1), 0.014), 1.6);
    }
    // Arteries (blood): a line down each arm and leg.
    for (const s of [-1, 1]) {
      const sh = figure === "female" ? 0.175 : 0.2;
      const pts = [v(0, 1.4, 0.02), v(s * sh, 1.42, 0.02), v(s * (sh + 0.07), 1.15, 0.02), v(s * (sh + 0.12), 0.9, 0.04)];
      organ("blood", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.008, 6), 2.2);
      const leg = [v(0, 1.0, 0.03), v(s * hip, 0.86, 0.04), v(s * (hip + 0.02), 0.48, 0.03), v(s * (hip + 0.03), 0.1, 0.02)];
      organ("blood", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leg), 24, 0.008, 6), 2.2);
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

    // Scan plane sweeping up and down.
    const scanG = track(new THREE.PlaneGeometry(1.0, 0.006));
    const scanM = track(new THREE.MeshBasicMaterial({ color: HOLO, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const scan = new THREE.Mesh(scanG, scanM);
    scan.rotation.x = -Math.PI / 2;
    scene.add(scan);

    // Hotspots: glowing sprites coloured by status.
    const tex = track(glowTexture());
    const sprites = new Map<RegionId, THREE.Sprite>();
    for (const id of Object.keys(ANCHORS) as RegionId[]) {
      const m = track(new THREE.SpriteMaterial({ map: tex, color: LEVEL_HEX[levelsRef.current[id] ?? "GREEN"], transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
      const s = new THREE.Sprite(m);
      s.position.set(...ANCHORS[id].pos);
      s.userData.id = id;
      s.renderOrder = 10;
      body.add(s);
      sprites.set(id, s);
    }

    // Click a hotspot in the scene to pick it (ignoring drags).
    const ray = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects([...sprites.values()])[0];
      if (hit) pickRef.current(hit.object.userData.id as RegionId);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

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
      for (const [id, mats] of Object.entries(organMats) as Array<[RegionId, THREE.ShaderMaterial[]]>) {
        const c = LEVEL_HEX[levelsRef.current[id] ?? "GREEN"];
        for (const m of mats) m.uniforms.uColor.value.setHex(c);
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
        s.getWorldPosition(tmp);
        center.set(0, tmp.y, 0);
        toCam.copy(camera.position).sub(center);
        const facing = tmp.clone().sub(center).dot(toCam) >= -0.002;
        tmp.project(camera);
        const x = (tmp.x * 0.5 + 0.5) * w;
        const y = (-tmp.y * 0.5 + 0.5) * h;
        (ANCHORS[id].side === "left" ? labelsLeft : labelsRight).push([id, x, y, facing]);
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
          const ly = ys[i];
          const lw = el.offsetWidth;
          const lx = side === "left" ? 8 : w - lw - 8;
          el.style.transform = `translate(${lx}px, ${ly - el.offsetHeight / 2}px)`;
          el.style.visibility = "visible";
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
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [figure]);

  return (
    <div
      ref={wrapRef}
      className="relative h-[560px] w-full select-none overflow-hidden rounded-xl border border-cyan-400/30 bg-[radial-gradient(ellipse_at_50%_35%,#0d2a3f_0%,#071423_55%,#050b16_100%)] shadow-[inset_0_0_40px_rgba(56,232,255,0.08)] sm:h-[620px]"
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
            className={`absolute left-0 top-0 flex w-[min(34%,200px)] items-center gap-2 rounded-lg border px-2 py-1.5 text-left backdrop-blur-sm transition-[background-color,border-color,opacity] ${
              ANCHORS[r.id].side === "right" ? "flex-row-reverse text-right" : ""
            } ${on ? "border-white/70 bg-white/10" : "border-cyan-400/25 bg-[#06121f]/70 hover:border-cyan-300/60"} ${dimmed(r.id) ? "!opacity-25" : ""}`}
            style={{ visibility: "hidden" }}
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
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-200/60">
        Drag to rotate · scroll to zoom
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
