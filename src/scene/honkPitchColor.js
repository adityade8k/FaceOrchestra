import { Color } from "three";
import { F4_MIDI_NOTE, semitonesFromPitchControl, octaveFromControl } from "../instruments/honk/HonkTuning.js";

// Tint the existing diffuse texture: its painted details, normal map and
// roughness remain intact. Octave four keeps the original neutral material.
export function honkPitchColor(midi) {
  const octave = Math.floor(midi / 12) - 1;
  if (octave === 4 || !Number.isFinite(midi)) return new Color(0xffffff);
  const pitchOctave = midi / 12 - 1;
  const hue = octave < 4
    ? 290 - Math.max(0, Math.min(4, pitchOctave)) * 35
    : 60 - Math.max(0, Math.min(2, pitchOctave - 5)) * 30;
  return new Color().setHSL(hue / 360, .72, .7);
}

export function updateHonkPitchColor(honk) {
  if (honk?.kind !== "honk" || !honk.root?.traverse) return;
  const state = honk.getResolvedPerformanceState?.() || honk.getLivePerformanceState?.() || {};
  const midi = Math.round(F4_MIDI_NOTE + semitonesFromPitchControl(state.earLeft ?? 0, honk.pitchSnap) +
    (octaveFromControl(state.earRight ?? 0) - 4) * 12);
  if (honk.pitchColorMidi === midi) return;
  const color = honkPitchColor(midi);
  honk.root.traverse(object => {
    if (!object.isMesh || !object.material || object.userData?.isNoteLabel ||
        (object.userData?.isHitTarget && !object.userData?.usesVisibleMeshForGrip) ||
        object.name?.startsWith("DEBUG_") || object.name?.startsWith("EDITOR_")) return;
    const tint = material => {
      if (!material?.color) return material;
      const owned = material.userData.honkPitchColorUnique ? material : material.clone();
      owned.userData.honkPitchBaseColor ??= material.color.toArray();
      owned.userData.honkPitchColorUnique = true;
      owned.userData.disposeOnInstrumentDelete = true;
      owned.color.fromArray(owned.userData.honkPitchBaseColor).multiply(color);
      return owned;
    };
    object.material = Array.isArray(object.material) ? object.material.map(tint) : tint(object.material);
  });
  honk.pitchColorMidi = midi;
}
