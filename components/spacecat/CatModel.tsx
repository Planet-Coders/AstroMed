"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import type { GrowthStage } from "@/lib/spaceCat";
import { CatArt, type CatMood } from "./CatArt";
import type { CatPart } from "./cat3d/buildCat";

const SpaceCat3D = dynamic(() => import("./cat3d/SpaceCat3D"), { ssr: false });

const noop = () => () => {};
function webgl() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
let cached: boolean | null = null;
const hasWebGL = () => (cached ??= webgl());

/** The 3D cat when WebGL is available, otherwise the flat SVG cat. */
export function CatModel(props: {
  stage: GrowthStage;
  mood: CatMood;
  talking: boolean;
  wagging?: boolean;
  compact?: boolean;
  onPart?: (part: CatPart | null) => void;
  className?: string;
  fallbackClassName?: string;
}) {
  const ok = useSyncExternalStore(noop, hasWebGL, () => false);
  if (!ok) {
    return (
      <CatArt
        stage={props.stage}
        mood={props.mood}
        talking={props.talking}
        wagging={props.wagging}
        compact={props.compact}
        className={props.fallbackClassName}
      />
    );
  }
  return <SpaceCat3D {...props} />;
}
