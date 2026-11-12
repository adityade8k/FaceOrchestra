import { Color } from "three";
import {
  F4_MIDI_NOTE,
  semitonesFromPitchControl,
  octaveFromControl,
} from "../instruments/honk/HonkTuning.js";

// The squeeze bulb gets its own pitch color. The mask preserves the painted
// face, while the existing normal/roughness maps keep the bulb's surface detail.
// The default octave keeps its original painted texture.
export function honkPitchColor(midi) {
  const octave = Math.floor(midi / 12) - 1;
  if (usesDefaultTexture(midi)) return new Color(0xffffff);
  const pitchOctave = midi / 12 - 1;
  const hue =
    octave < 4
      ? 290 - Math.max(0, Math.min(4, pitchOctave)) * 35
      : 60 - Math.max(0, Math.min(2, pitchOctave - 5)) * 30;
  // Half the previous saturation; keep the hue and lightness unchanged.
  return new Color().setHSL(hue / 360, 0.49, 0.5);
}

function usesDefaultTexture(midi) {
  return !Number.isFinite(midi) || Math.floor(midi / 12) - 1 === 4;
}

export function updateHonkPitchColor(honk, mask) {
  if (honk?.kind !== "honk" || !honk.root?.traverse) return;
  const state = honk.getResolvedPerformanceState?.() || honk.getLivePerformanceState?.() || {};
  const midi = Math.round(
    F4_MIDI_NOTE +
      semitonesFromPitchControl(state.earLeft ?? 0, honk.pitchSnap) +
      (octaveFromControl(state.earRight ?? 0) - 4) * 12,
  );
  if (honk.pitchColorMidi === midi && honk.pitchColorMask === mask) return;
  const color = honkPitchColor(midi);
  const mode = usesDefaultTexture(midi) ? "texture" : "replace";
  honk.root.traverse((object) => {
    if (
      !object.isMesh ||
      !object.material ||
      object.userData?.isNoteLabel ||
      (object.userData?.isHitTarget && !object.userData?.usesVisibleMeshForGrip) ||
      object.name?.startsWith("DEBUG_") ||
      object.name?.startsWith("EDITOR_")
    )
      return;
    const tint = (material) => {
      if (!material?.color) return material;
      const owned = material.userData.honkPitchColorUnique ? material : material.clone();
      owned.userData.honkPitchBaseColor ??= material.color.toArray();
      owned.userData.honkPitchColorUnique = true;
      owned.userData.disposeOnInstrumentDelete = true;
      if (mask && mode === "replace") owned.color.copy(color);
      else owned.color.fromArray(owned.userData.honkPitchBaseColor).multiply(color);
      applyHonkPitchMask(owned, mask, undefined, mode);
      return owned;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(tint)
      : tint(object.material);
  });
  honk.pitchColorMidi = midi;
  honk.pitchColorMask = mask;
}

const maskedMaterials = new WeakMap();

// A white mask replaces the painted albedo with the note color. Black keeps
// the original paint. Normal/roughness maps and lighting still shape the bulb.
// "texture" preserves the default paint; "tint" reproduces older captures.
export function applyHonkPitchMask(
  material,
  mask,
  baseColor = material?.userData.honkPitchBaseColor,
  mode = material?.userData.honkPitchColorMode || "replace",
) {
  if (!material?.map || !mask) return material;
  const cached = maskedMaterials.get(material);
  if (cached?.mask === mask && cached.mode === mode) return material;
  material.honkPitchMask = mask;
  material.userData.honkPitchBaseColor = baseColor || material.color.toArray();
  material.userData.honkPitchColorMode = mode;
  const neutral = new Color().fromArray(material.userData.honkPitchBaseColor);
  const fragment =
    mode === "texture"
      ? "#include <map_fragment>"
      : mode === "tint"
        ? `#ifdef USE_MAP
        float honkTintWeight = texture2D(honkPitchMask, vMapUv).r;
        diffuseColor.rgb = mix(honkPitchBaseColor, diffuseColor.rgb, honkTintWeight);
       #endif
       #include <map_fragment>`
        : `#ifdef USE_MAP
        vec3 honkBulbColor = diffuseColor.rgb;
        diffuseColor.rgb = honkPitchBaseColor;
       #endif
       #include <map_fragment>
       #ifdef USE_MAP
        // Reject low mip-filter weights from neighboring UV islands.
        float honkColorWeight = smoothstep(0.25, 0.75, texture2D(honkPitchMask, vMapUv).r);
        diffuseColor.rgb = mix(diffuseColor.rgb, honkBulbColor, honkColorWeight);
       #endif`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.honkPitchMask = { value: mask };
    shader.uniforms.honkPitchBaseColor = { value: neutral };
    shader.fragmentShader = `uniform sampler2D honkPitchMask;
uniform vec3 honkPitchBaseColor;
${shader.fragmentShader}`.replace("#include <map_fragment>", fragment);
  };
  material.customProgramCacheKey = () => {
    if (mode === "texture") return "honk-pitch-texture-v1";
    return mode === "tint" ? "honk-pitch-mask-v1" : "honk-pitch-color-replace-v2";
  };
  material.needsUpdate = true;
  maskedMaterials.set(material, { mask, mode });
  return material;
}
