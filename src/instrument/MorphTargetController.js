import * as THREE from "three";
import { DEBUG_LOG_MORPHS, MORPH_TARGET_NAMES } from "../config.js";

export class MorphTargetController {
  constructor(root) {
    this.root = root;
    this.meshes = [];
    this.missingMorphWarnings = new Set();
    this.currentVowelIndex = -1;
    this.currentVowelLetter = "neutral";

    this.root.traverse((object) => {
      if (object.isMesh && object.morphTargetDictionary) {
        this.meshes.push(object);
      }
    });

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

    for (const morphName of this.getExpectedMorphNames()) {
      if (!morphNames.has(morphName)) {
        console.warn(`Expected morph target missing: ${morphName}`);
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
        return mesh.morphTargetInfluences[index] || 0;
      }
    }
    return 0;
  }

  setMorph(morphName, value) {
    const clamped = THREE.MathUtils.clamp(value, 0, 1);
    let applied = false;

    for (const mesh of this.meshes) {
      const index = mesh.morphTargetDictionary?.[morphName];
      if (index === undefined) {
        continue;
      }
      mesh.morphTargetInfluences[index] = clamped;
      applied = true;
    }

    if (!applied && !this.missingMorphWarnings.has(morphName)) {
      console.warn(`Morph target not found on any mesh: ${morphName}`);
      this.missingMorphWarnings.add(morphName);
    }
  }

  setVowel(vowelName) {
    for (const [letter, morphName] of this.vowelEntries) {
      this.setMorph(morphName, letter === vowelName ? 1 : 0);
    }

    this.currentVowelIndex = this.vowelEntries.findIndex(([letter]) => letter === vowelName);
    this.currentVowelLetter = vowelName || "neutral";
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
    const value = THREE.MathUtils.clamp(signedValue, -1, 1);
    const up = Math.max(value, 0);
    const down = Math.max(-value, 0);

    if (side === "left") {
      this.setMorph(MORPH_TARGET_NAMES.ears.leftUp, up);
      this.setMorph(MORPH_TARGET_NAMES.ears.leftDown, down);
      return;
    }

    this.setMorph(MORPH_TARGET_NAMES.ears.rightUp, up);
    this.setMorph(MORPH_TARGET_NAMES.ears.rightDown, down);
  }

  getEarAmount(side) {
    if (side === "left") {
      return this.getValue(MORPH_TARGET_NAMES.ears.leftUp) - this.getValue(MORPH_TARGET_NAMES.ears.leftDown);
    }
    return this.getValue(MORPH_TARGET_NAMES.ears.rightUp) - this.getValue(MORPH_TARGET_NAMES.ears.rightDown);
  }

  setBend(signedValue) {
    const value = THREE.MathUtils.clamp(signedValue, -1, 1);
    this.setMorph(MORPH_TARGET_NAMES.bendRight, Math.max(value, 0));
    this.setMorph(MORPH_TARGET_NAMES.bendLeft, Math.max(-value, 0));
  }

  resetBend() {
    this.setBend(0);
  }

  resetAll() {
    this.setVowel(null);
    this.setSqueeze(0);
    this.setNose(0);
    this.setEar("left", 0);
    this.setEar("right", 0);
    this.resetBend();
  }
}
