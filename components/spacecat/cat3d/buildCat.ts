import * as THREE from "three";
import type { CatMood } from "../CatArt";

/**
 * Procedural 3D astronaut tabby (original, built from primitives, no downloaded models).
 * buildCat() returns the scene graph plus an update() to call every frame and a dispose().
 */

export type CatPart = "tail" | "face" | "body";

export type CatFrameState = {
  width: number; // body width multiplier from the growth stage
  mood: CatMood;
  talking: boolean;
  wagging: boolean;
  yaw: number; // drag-to-turn, radians
  motion: number; // 1 normal, ~0.35 reduced motion
};

const GLOW = 0x46e3ff;
const FUR = 0x8f969f;
const FUR_DARK = 0x464c55;

export function buildCat({ compact = false }: { compact?: boolean } = {}) {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => {
    disposables.push(x);
    return x;
  };

  // ---------- textures ----------
  const furTex = keep(stripeTexture());
  const cheekTex = keep(cheekTexture());
  const shadowTex = keep(radialTexture("rgba(40,30,20,0.55)", "rgba(40,30,20,0)"));
  const sparkTex = keep(radialTexture("rgba(255,240,170,1)", "rgba(255,200,80,0)"));

  // ---------- materials ----------
  const furHead = keep(new THREE.MeshStandardMaterial({ map: furTex, roughness: 0.78 }));
  const fur = keep(new THREE.MeshStandardMaterial({ color: FUR, roughness: 0.8 }));
  const furCheek = keep(new THREE.MeshStandardMaterial({ map: cheekTex, roughness: 0.8 }));
  const furDark = keep(new THREE.MeshStandardMaterial({ color: FUR_DARK, roughness: 0.8 }));
  const white = keep(new THREE.MeshStandardMaterial({ color: 0xf7f8fa, roughness: 0.6 }));
  const pink = keep(new THREE.MeshStandardMaterial({ color: 0xff9db0, roughness: 0.35, emissive: 0x6a2030, emissiveIntensity: 0.35 }));
  const pinkSoft = keep(new THREE.MeshStandardMaterial({ color: 0xf5b8c3, roughness: 0.7 }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x1c2430, roughness: 0.2, metalness: 0.1 }));
  const mouthMat = keep(new THREE.MeshStandardMaterial({ color: 0x6e2433, roughness: 0.5 }));
  const eyeWhite = keep(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.12, clearcoat: 1 }));
  const iris = keep(new THREE.MeshPhysicalMaterial({ color: 0x22374a, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }));
  const shine = keep(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const suit = keep(new THREE.MeshPhysicalMaterial({ color: 0xeef1f5, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.3 }));
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0xc8ced6, metalness: 1, roughness: 0.22 }));
  const panel = keep(new THREE.MeshStandardMaterial({ color: 0x8e97a3, metalness: 0.8, roughness: 0.35 }));
  const glowCore = keep(new THREE.MeshBasicMaterial({ color: GLOW, toneMapped: false }));
  const glowHalo = keep(
    new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  );
  const red = keep(new THREE.MeshBasicMaterial({ color: 0xff5a5a, toneMapped: false }));
  const yellow = keep(new THREE.MeshBasicMaterial({ color: 0xffd54a, toneMapped: false }));
  const glass = keep(
    new THREE.MeshPhysicalMaterial({
      color: 0xdff4ff,
      roughness: 0.04,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      transparent: true,
      opacity: 0.1,
      envMapIntensity: 2.2,
      depthWrite: false,
      side: THREE.FrontSide,
    })
  );

  // ---------- geometries (shared) ----------
  const sphere = keep(new THREE.SphereGeometry(1, 40, 28));
  const lowSphere = keep(new THREE.SphereGeometry(1, 16, 12));
  const capsule = (r: number, len: number) => keep(new THREE.CapsuleGeometry(r, len, 8, 20));
  const torus = (r: number, tube: number) => keep(new THREE.TorusGeometry(r, tube, 12, 48));
  const box = (x: number, y: number, z: number) => keep(new THREE.BoxGeometry(x, y, z, 2, 2, 2));
  const cone = (r: number, h: number) => keep(new THREE.ConeGeometry(r, h, 24));
  const cyl = (r: number, h: number) => keep(new THREE.CylinderGeometry(r, r, h, 24));

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, pos: [number, number, number] = [0, 0, 0], scale?: [number, number, number]) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(...pos);
    if (scale) o.scale.set(...scale);
    return o;
  };
  const glowRing = (r: number, tube: number, pos: [number, number, number], rotX = Math.PI / 2) => {
    const g = new THREE.Group();
    g.add(mesh(torus(r, tube), glowCore));
    g.add(mesh(torus(r, tube * 3.2), glowHalo));
    g.position.set(...pos);
    g.rotation.x = rotX;
    return g;
  };
  const tag = (o: THREE.Object3D, part: CatPart) => {
    o.userData.part = part;
    return o;
  };

  // ---------- scene graph ----------
  const root = new THREE.Group();
  const bob = new THREE.Group();
  root.add(bob);

  // contact shadow on the floor (not bobbing)
  const shadow = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(1.9, 1.9)),
    keep(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }))
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  root.add(shadow);

  // legs + boots
  const legs = tag(new THREE.Group(), "body");
  for (const s of [-1, 1]) {
    legs.add(mesh(capsule(0.2, 0.3), suit, [s * 0.27, 0.36, 0]));
    legs.add(mesh(box(0.26, 0.14, 0.12), metal, [s * 0.27, 0.42, 0.17]));
    legs.add(glowRing(0.205, 0.022, [s * 0.27, 0.27, 0]));
    legs.add(mesh(sphere, metal, [s * 0.29, 0.1, 0.06], [0.25, 0.15, 0.33]));
  }
  bob.add(legs);

  // torso
  const body = tag(new THREE.Group(), "body");
  body.position.y = 0.98;
  body.add(mesh(capsule(0.56, 0.3), suit));
  body.add(mesh(torus(0.56, 0.06), metal, [0, -0.28, 0]).rotateX(Math.PI / 2));
  body.add(glowRing(0.575, 0.022, [0, -0.2, 0]));
  body.add(mesh(box(0.16, 0.12, 0.06), metal, [0, -0.28, 0.55]));
  body.add(mesh(box(0.42, 0.28, 0.08), panel, [0, 0.16, 0.52]));
  body.add(mesh(lowSphere, red, [-0.13, 0.2, 0.57], [0.035, 0.035, 0.035]));
  body.add(mesh(lowSphere, yellow, [-0.04, 0.2, 0.57], [0.035, 0.035, 0.035]));
  body.add(mesh(lowSphere, glowCore, [0.12, 0.2, 0.57], [0.045, 0.045, 0.045]));
  body.add(mesh(box(0.22, 0.02, 0.01), dark, [-0.06, 0.09, 0.565]));
  body.add(mesh(box(0.22, 0.02, 0.01), dark, [-0.06, 0.05, 0.565]));
  bob.add(body);

  // neck ring (sits under the helmet)
  const neck = new THREE.Group();
  neck.position.y = 1.72;
  neck.add(mesh(torus(0.5, 0.1), metal).rotateX(Math.PI / 2));
  neck.add(glowRing(0.52, 0.028, [0, 0.07, 0]));
  tag(neck, "body");
  bob.add(neck);

  // arms
  const arm = (side: -1 | 1) => {
    const pivot = tag(new THREE.Group(), "body");
    pivot.position.set(side * 0.55, 1.36, 0);
    const a = mesh(capsule(0.17, 0.42), suit, [0, -0.33, 0]);
    pivot.add(a);
    pivot.add(glowRing(0.175, 0.02, [0, -0.56, 0]));
    const paw = mesh(sphere, fur, [0, -0.7, 0], [0.19, 0.19, 0.19]);
    pivot.add(paw);
    if (side === 1) {
      // toe beans face the viewer when waving
      const beans = new THREE.Group();
      beans.position.set(0, -0.74, 0.12);
      beans.add(mesh(lowSphere, dark, [0, -0.02, 0.06], [0.07, 0.055, 0.03]));
      for (const [x, y] of [[-0.08, 0.06], [0, 0.09], [0.08, 0.06]]) beans.add(mesh(lowSphere, dark, [x, y, 0.06], [0.03, 0.03, 0.02]));
      pivot.add(beans);
    }
    return pivot;
  };
  const armL = arm(-1);
  const armR = arm(1);
  bob.add(armL, armR);

  // head
  const head = tag(new THREE.Group(), "face");
  head.position.y = 2.32;
  const skull = mesh(sphere, furHead, [0, 0, 0], [0.66, 0.6, 0.6]);
  skull.rotation.y = -Math.PI / 2; // texture's forehead stripes to the front
  head.add(skull);
  for (const s of [-1, 1]) head.add(mesh(sphere, furCheek, [s * 0.43, -0.2, 0.14], [0.27, 0.22, 0.24]));
  head.add(mesh(sphere, white, [0, -0.2, 0.47], [0.29, 0.19, 0.17]));
  head.add(mesh(sphere, pink, [0, -0.11, 0.63], [0.07, 0.048, 0.045]));
  // ears
  for (const s of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(s * 0.36, 0.48, -0.02);
    ear.rotation.z = -s * 0.38;
    ear.add(mesh(cone(0.19, 0.42), fur));
    ear.add(mesh(cone(0.11, 0.28), pinkSoft, [0, -0.03, 0.07]));
    head.add(ear);
  }
  // eyes (scale.y animates blink / wink / happy-closed)
  const eyes: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(s * 0.235, 0.06, 0.53);
    e.add(mesh(sphere, eyeWhite, [0, 0, 0], [0.175, 0.205, 0.1]));
    e.add(mesh(sphere, iris, [0, -0.012, 0.05], [0.135, 0.16, 0.075]));
    e.add(mesh(lowSphere, shine, [0.05, 0.07, 0.122], [0.042, 0.042, 0.02]));
    e.add(mesh(lowSphere, shine, [-0.045, -0.065, 0.122], [0.02, 0.02, 0.01]));
    head.add(e);
    eyes.push(e);
  }
  // brows
  const brows: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const b = mesh(capsule(0.02, 0.12), furDark, [s * 0.24, 0.32, 0.52]);
    b.rotation.z = Math.PI / 2;
    head.add(b);
    brows.push(b);
  }
  // mouth: smile arc + open mouth
  const smile = mesh(keep(new THREE.TorusGeometry(0.07, 0.015, 8, 20, Math.PI)), dark, [0, -0.23, 0.635]);
  smile.rotation.z = Math.PI;
  head.add(smile);
  const mouth = mesh(sphere, mouthMat, [0, -0.27, 0.615], [0.075, 0.06, 0.04]);
  mouth.visible = false;
  head.add(mouth);
  // whiskers
  const whiskerGeo = cyl(0.006, 0.42);
  for (const s of [-1, 1])
    for (const k of [-1, 0, 1]) {
      const w = mesh(whiskerGeo, shine, [s * 0.4, -0.2 + k * 0.045, 0.52]);
      w.rotation.z = Math.PI / 2 + s * k * 0.18;
      w.rotation.y = -s * 0.25;
      head.add(w);
    }
  // helmet
  const helmet = new THREE.Group();
  helmet.add(mesh(sphere, glass, [0, 0.02, 0], [0.98, 0.98, 0.98]));
  helmet.add(mesh(sphere, keep(fresnelMaterial()), [0, 0.02, 0], [0.985, 0.985, 0.985]));
  for (const s of [-1, 1]) {
    const pod = mesh(cyl(0.17, 0.16), metal, [s * 0.98, -0.02, 0]);
    pod.rotation.z = Math.PI / 2;
    helmet.add(pod);
    helmet.add(glowRing(0.08, 0.018, [s * 1.07, -0.02, 0], 0).rotateY(Math.PI / 2));
  }
  head.add(helmet);
  bob.add(head);

  // tail: a chain of segments; each one bends a little, so a travelling wave curls it like an S
  const TAIL_N = 12;
  const tailRoot = tag(new THREE.Group(), "tail");
  if (compact) {
    tailRoot.position.set(0.72, 1.55, 0.15);
    tailRoot.rotation.set(0, 0, -0.25);
  } else {
    tailRoot.position.set(0.38, 0.62, -0.3);
    tailRoot.rotation.set(-0.45, 0, -1.05);
  }
  const tailSegs: THREE.Group[] = [];
  let parent: THREE.Object3D = tailRoot;
  for (let i = 0; i < TAIL_N; i++) {
    const seg = new THREE.Group();
    seg.position.y = i === 0 ? 0 : 0.13;
    const r = 0.11 - i * 0.004;
    seg.add(mesh(sphere, i % 2 === 1 || i === TAIL_N - 1 ? furDark : fur, [0, 0.065, 0], [r, r * 1.25, r]));
    parent.add(seg);
    tailSegs.push(seg);
    parent = seg;
  }
  // fat invisible hit area so the tail is easy to tap
  const tailHit = new THREE.Mesh(capsule(0.28, 1.2), keep(new THREE.MeshBasicMaterial({ visible: false })));
  tailHit.position.y = 0.7;
  tailRoot.add(tailHit);
  bob.add(tailRoot);

  // sparkles shown while wagging
  const SPARKS = 26;
  const sparkGeo = keep(new THREE.BufferGeometry());
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkSeed = Array.from({ length: SPARKS }, () => [Math.random(), Math.random(), Math.random()]);
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(
    sparkGeo,
    keep(new THREE.PointsMaterial({ map: sparkTex, size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  );
  sparks.visible = false;
  root.add(sparks);

  if (compact) {
    legs.visible = false;
    armL.visible = false;
    shadow.visible = false;
  }

  // ---------- per-frame animation ----------
  let t = 0;
  let blinkAt = 2;
  let blinkT = -1;
  let waveT = -1;
  let nextWave = 3;
  let eyeL = 1;
  let eyeR = 1;
  let wagAmp = 0;
  let phaseZ = 0;
  let phaseX = 0;

  function update(dt: number, s: CatFrameState) {
    const m = s.motion;
    t += dt * m;

    // float bob + sway + drag yaw
    bob.position.y = m < 0.5 ? 0 : Math.sin(t * 1.6) * 0.06;
    bob.rotation.z = Math.sin(t * 0.9) * 0.03;
    root.rotation.y += (s.yaw - root.rotation.y) * Math.min(1, dt * 8);
    shadow.scale.setScalar(1 - bob.position.y * 1.5);

    // growth stage width + breathing
    const breathe = 1 + Math.sin(t * 2.2) * 0.015;
    body.scale.set(s.width * breathe, 1 / breathe, 0.92 + s.width * 0.08);
    for (const o of [armL, armR]) o.position.x = Math.sign(o.position.x) * (0.5 + 0.12 * s.width + 0.05);

    // eating: lean towards the bowl
    const lean = s.mood === "eating" ? 0.35 + Math.sin(t * 9) * 0.06 : 0;
    head.rotation.x += (lean - head.rotation.x) * Math.min(1, dt * 6);
    head.rotation.z = Math.sin(t * 1.1) * 0.04;

    // blink / wink / happy closed eyes
    blinkAt -= dt;
    if (blinkAt <= 0 && blinkT < 0) {
      blinkT = 0;
      blinkAt = 2.5 + Math.random() * 3;
    }
    let blink = 1;
    if (blinkT >= 0) {
      blinkT += dt;
      blink = blinkT < 0.08 ? 1 - blinkT / 0.08 : blinkT < 0.16 ? (blinkT - 0.08) / 0.08 : 1;
      if (blinkT >= 0.16) blinkT = -1;
    }
    const closed = s.mood === "purr" || s.mood === "eating";
    const wink = s.mood === "wink" || s.mood === "giggle";
    const targetL = closed || wink ? 0.1 : Math.max(0.1, blink);
    const targetR = closed ? 0.1 : Math.max(0.1, blink);
    eyeL += (targetL - eyeL) * Math.min(1, dt * 18);
    eyeR += (targetR - eyeR) * Math.min(1, dt * 18);
    eyes[0].scale.y = eyeL;
    eyes[1].scale.y = eyeR;
    const sad = s.mood === "hungry";
    brows[0].rotation.z = Math.PI / 2 + (sad ? 0.35 : -0.08);
    brows[1].rotation.z = Math.PI / 2 + (sad ? -0.35 : 0.08);

    // mouth: open and flap while talking or eating, frown when hungry
    const open = s.talking || s.mood === "eating";
    mouth.visible = open;
    smile.visible = !open;
    if (open) mouth.scale.y = 0.03 + Math.abs(Math.sin(t * (s.talking ? 16 : 10))) * 0.06;
    smile.rotation.z = sad ? 0 : Math.PI;
    smile.position.y = sad ? -0.29 : -0.23;

    // paw wave every few seconds
    nextWave -= dt;
    if (nextWave <= 0 && waveT < 0) {
      waveT = 0;
      nextWave = 4 + Math.random() * 3;
    }
    let wave = 0;
    if (waveT >= 0) {
      waveT += dt;
      wave = Math.sin(waveT * 14) * Math.sin(Math.min(1, waveT / 1.2) * Math.PI) * 0.35;
      if (waveT > 1.2) waveT = -1;
    }
    armR.rotation.z = 2.55 + wave;
    armR.rotation.x = -0.2;
    armL.rotation.z = -0.32 + Math.sin(t * 1.6) * 0.04;

    // tail: travelling sine wave down the chain
    // Ease into the wag quickly (~0.25 s) and out gently (~0.8 s); the phase keeps accumulating,
    // so changing speed never makes the tail jump.
    const target = s.wagging ? 1 : 0;
    const k = target > wagAmp ? 12 : 3.5;
    wagAmp += (target - wagAmp) * (1 - Math.exp(-k * dt));
    const ease = wagAmp * wagAmp * (3 - 2 * wagAmp); // smoothstep
    const speed = 2.2 + ease * 8;
    const amp = 0.16 + ease * 0.08;
    phaseZ += dt * m * speed;
    phaseX += dt * m * speed * 0.6;
    for (let i = 1; i < tailSegs.length; i++) {
      const seg = tailSegs[i];
      seg.rotation.x = 0.13 + Math.sin(phaseX - i * 0.55) * amp * 0.6;
      seg.rotation.z = Math.sin(phaseZ - i * 0.5) * amp;
    }

    // sparkles around the tail while wagging
    sparks.visible = wagAmp > 0.05;
    if (sparks.visible) {
      const base = new THREE.Vector3();
      tailSegs[tailSegs.length - 3].getWorldPosition(base);
      root.worldToLocal(base);
      for (let i = 0; i < SPARKS; i++) {
        const [a, b, c] = sparkSeed[i];
        const life = (t * 1.2 + a) % 1;
        sparkPos[i * 3] = base.x + Math.cos(b * 6.28) * (0.2 + life * 0.5);
        sparkPos[i * 3 + 1] = base.y + life * 0.7 - 0.2;
        sparkPos[i * 3 + 2] = base.z + Math.sin(c * 6.28) * (0.2 + life * 0.4);
      }
      sparkGeo.attributes.position.needsUpdate = true;
      (sparks.material as THREE.PointsMaterial).opacity = Math.min(1, wagAmp * 1.4);
    }
  }

  function dispose() {
    for (const d of disposables) d.dispose();
  }

  return { root, update, dispose };
}

/** Grey tabby texture for the head sphere: forehead stripes, cheek stripes, darker back. */
function stripeTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#8f969f";
  g.fillRect(0, 0, 512, 256);
  // soft light belly/face region (u=0.5 faces front after the skull's -90deg turn)
  const face = g.createRadialGradient(256, 150, 10, 256, 150, 120);
  face.addColorStop(0, "rgba(190,196,204,0.55)");
  face.addColorStop(1, "rgba(190,196,204,0)");
  g.fillStyle = face;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#464c55";
  const stripe = (x: number, w: number, len: number) => {
    g.beginPath();
    g.moveTo(x - w, 0);
    g.lineTo(x + w, 0);
    g.lineTo(x, len);
    g.closePath();
    g.fill();
  };
  // forehead "M"
  stripe(256, 14, 96);
  stripe(226, 11, 74);
  stripe(286, 11, 74);
  // back of the head
  for (let x = 0; x < 512; x += 46) if (Math.abs(x - 256) > 90) stripe(x, 10, 80);
  // cheek stripes (sides)
  for (const cx of [140, 372]) {
    for (const dy of [0, 16]) {
      g.beginPath();
      g.ellipse(cx, 138 + dy, 26, 5, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Rim-only glow so the clear helmet reads as glass. */
function fresnelMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(0xcfeeff) } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0); gl_FragColor = vec4(uColor * f * 0.9, f); }`,
  });
}

/** Two short stripes per cheek. */
function cheekTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#8f969f";
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = "#464c55";
  for (const cx of [0, 128, 256])
    for (const dy of [-10, 10]) {
      g.beginPath();
      g.ellipse(cx, 60 + dy, 30, 5, 0, 0, Math.PI * 2);
      g.fill();
    }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function radialTexture(inner: string, outer: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
