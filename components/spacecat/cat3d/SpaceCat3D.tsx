"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { STAGE_WIDTH, type GrowthStage } from "@/lib/spaceCat";
import type { CatMood } from "../CatArt";
import { buildCat, type CatPart } from "./buildCat";

/**
 * Real-time 3D space cat (three.js). Transparent canvas over the cabin panel.
 * Tap tail / face / body (raycast), drag sideways to turn it (springs back).
 * Pauses when offscreen or the tab is hidden; disposes everything on unmount.
 */
export default function SpaceCat3D({
  stage,
  mood,
  talking,
  wagging = false,
  compact = false,
  lite = false,
  onPart,
  className = "",
}: {
  stage: GrowthStage;
  mood: CatMood;
  talking: boolean;
  wagging?: boolean;
  compact?: boolean;
  /** Cheaper rendering (no bloom, shells or shadow maps), e.g. for the floating cat. */
  lite?: boolean;
  onPart?: (part: CatPart | null) => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const state = useRef({ width: STAGE_WIDTH[stage], mood, talking, wagging });
  const onPartRef = useRef(onPart);
  useEffect(() => {
    state.current = { width: STAGE_WIDTH[stage], mood, talking, wagging };
    onPartRef.current = onPart;
  }, [stage, mood, talking, wagging, onPart]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Phones and the small floating cat get the light path.
    const high = !lite && !compact && window.innerWidth >= 768;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 2 : 1.5));
    if (high) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const envTex = pmrem.fromScene(room, 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.55;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f70, 0.75));
    const key = new THREE.DirectionalLight(0xffe7cc, 2.0);
    key.position.set(3, 5, 4);
    if (high) {
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -2;
      key.shadow.camera.right = 2;
      key.shadow.camera.top = 3.2;
      key.shadow.camera.bottom = -0.5;
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 14;
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.02;
      key.shadow.radius = 4;
    }
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x46e3ff, 3.2);
    rim.position.set(-3, 3, -4);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-4, 1.5, 3);
    scene.add(fill);

    const cat = buildCat({ compact, quality: high ? "high" : "lite" });
    scene.add(cat.root);

    const camera = new THREE.PerspectiveCamera(compact ? 32 : 30, 1, 0.1, 50);
    if (compact) {
      camera.position.set(0.15, 2.35, 4.1);
      camera.lookAt(0.15, 2.25, 0);
    } else {
      camera.position.set(0, 1.75, 7.4);
      camera.lookAt(0, 1.4, 0);
    }

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // ---- interaction: tap = raycast part, drag = turn ----
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let yaw = 0;
    let down: { x: number; y: number; yaw: number } | null = null;
    let moved = 0;
    const partAt = (e: PointerEvent): CatPart | null => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      for (const hit of ray.intersectObject(cat.root, true)) {
        let o: THREE.Object3D | null = hit.object;
        while (o && !o.userData.part) o = o.parent;
        if (o?.userData.part) return o.userData.part as CatPart;
      }
      return null;
    };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, yaw };
      moved = 0;
      renderer.domElement.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!down || compact) return;
      moved = Math.max(moved, Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y));
      yaw = Math.max(-0.9, Math.min(0.9, down.yaw + (e.clientX - down.x) * 0.012));
    };
    const onUp = (e: PointerEvent) => {
      if (down && moved < 8) onPartRef.current?.(partAt(e));
      down = null;
    };
    const el = renderer.domElement;
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", () => (down = null));

    // ---- loop, paused offscreen / hidden ----
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(host);
    const clock = new THREE.Clock();
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (!visible || document.hidden) return;
      if (!down) yaw *= 1 - Math.min(1, dt * 2.5); // spring back to facing front
      cat.update(dt, { ...state.current, yaw, motion: reduced.matches ? 0.35 : 1 });
      renderer.render(scene, camera);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      cat.dispose();
      envTex.dispose();
      pmrem.dispose();
      room.dispose?.();
      renderer.dispose();
      renderer.forceContextLoss();
      el.remove();
    };
  }, [compact, lite]);

  return <div ref={hostRef} className={className} />;
}
