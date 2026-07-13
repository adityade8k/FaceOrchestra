import { DEBUG_LOG_MORPHS } from "../../config/debug.js";
import { MORPH_TARGET_NAMES } from "../../config/honk.js";

export class MorphTargetController {
  constructor(root, { warnMissingExpectedMorphs = true } = {}) {
    this.root = root;
    this.meshes = findMorphMeshes(root);
    this.missingMorphWarnings = new Set();
    this.currentVowelIndex = -1;
    this.currentVowelLetter = "neutral";
    this.warnMissingExpectedMorphs = warnMissingExpectedMorphs;
    this.vowelEntries = Object.entries(MORPH_TARGET_NAMES.vowels);
    this.logDiagnostics();
  }

  logDiagnostics() {
    const morphNames = new Set();
    for (const mesh of this.meshes) {
      Object.keys(mesh.morphTargetDictionary || {}).forEach((name) => morphNames.add(name));
    }
    if (DEBUG_LOG_MORPHS) {
      console.log("Morph targets found:", [...morphNames].sort());
    }
    if (this.warnMissingExpectedMorphs) {
      for (const morphName of this.getExpectedMorphNames()) {
        if (!morphNames.has(morphName)) {
          console.warn(`Expected morph target missing: ${morphName}`);
        }
      }
    }
  }

  getExpectedMorphNames() {
    return [
      MORPH_TARGET_NAMES.bendRight,
      MORPH_TARGET_NAMES.bendLeft,
      MORPH_TARGET_NAMES.squeeze,
      MORPH_TARGET_NAMES.nose,
      ...Object.values(MORPH_TARGET_NAMES.vowels),
      ...Object.values(MORPH_TARGET_NAMES.ears),
    ];
  }

  getValue(morphName) {
    for (const mesh of this.meshes) {
      const index = mesh.morphTargetDictionary?.[morphName];
      if (index !== undefined) {
        return mesh.morphTargetInfluences?.[index] || 0;
      }
    }
    return 0;
  }

  setMorph(morphName, value) {
    const clamped = clamp(value, 0, 1);
    let applied = false;
    for (const mesh of this.meshes) {
      const index = mesh.morphTargetDictionary?.[morphName];
      if (index === undefined || !mesh.morphTargetInfluences) {
        continue;
      }
      mesh.morphTargetInfluences[index] = clamped;
      applied = true;
    }
    if (!applied && !this.missingMorphWarnings.has(morphName)) {
      console.warn(`Morph target not found on any mesh: ${morphName}`);
      this.missingMorphWarnings.add(morphName);
    }
    return applied;
  }

  setVowel(vowelName) {
    for (const [letter, morphName] of this.vowelEntries) {
      this.setMorph(morphName, letter === vowelName ? 1 : 0);
    }
    this.currentVowelIndex = this.vowelEntries.findIndex(([letter]) => letter === vowelName);
    this.currentVowelLetter = vowelName || "neutral";
    return this.currentVowelLetter;
  }

  cycleVowel() {
    this.currentVowelIndex = (this.currentVowelIndex + 1) % this.vowelEntries.length;
    const [letter] = this.vowelEntries[this.currentVowelIndex];
    this.setVowel(letter);
    return letter;
  }

  setSqueeze(value) {
    this.setMorph(MORPH_TARGET_NAMES.squeeze, value);
  }

  setNose(value) {
    this.setMorph(MORPH_TARGET_NAMES.nose, value);
  }

  setEar(side, signedValue) {
    const value = clamp(signedValue, -1, 1);
    const up = Math.max(value, 0);
    const down = Math.max(-value, 0);
    if (side === "left") {
      this.setMorph(MORPH_TARGET_NAMES.ears.leftUp, up);
      this.setMorph(MORPH_TARGET_NAMES.ears.leftDown, down);
    } else {
      this.setMorph(MORPH_TARGET_NAMES.ears.rightUp, up);
      this.setMorph(MORPH_TARGET_NAMES.ears.rightDown, down);
    }
  }

  getEarAmount(side) {
    const names = side === "left"
      ? [MORPH_TARGET_NAMES.ears.leftUp, MORPH_TARGET_NAMES.ears.leftDown]
      : [MORPH_TARGET_NAMES.ears.rightUp, MORPH_TARGET_NAMES.ears.rightDown];
    return this.getValue(names[0]) - this.getValue(names[1]);
  }

  setBend(signedValue) {
    const value = clamp(signedValue, -1, 1);
    this.setMorph(MORPH_TARGET_NAMES.bendRight, Math.max(value, 0));
    this.setMorph(MORPH_TARGET_NAMES.bendLeft, Math.max(-value, 0));
  }

  applyPerformanceState(state) {
    this.setSqueeze(state?.squeeze ?? 0);
    this.setBend(state?.bend ?? 0);
    this.setEar("left", state?.earLeft ?? 0);
    this.setEar("right", state?.earRight ?? 0);
    this.setNose(state?.nose ?? 0);
    this.setVowel(state?.vowel === "neutral" ? null : state?.vowel);
  }

  resetAll() {
    this.applyPerformanceState({
      squeeze: 0,
      bend: 0,
      earLeft: 0,
      earRight: 0,
      nose: 0,
      vowel: "neutral",
    });
  }
}

export const HonkMorphDriver = MorphTargetController;

export function findMorphMeshes(root) {
  const meshes = [];
  root?.traverse?.((object) => {
    if (object.isMesh && object.morphTargetDictionary) {
      meshes.push(object);
    }
  });
  return meshes;
}

function clamp(value, min, max) {
  const number = Number.isFinite(value) ? value : 0;
  return Math.min(Math.max(number, min), max);
}
