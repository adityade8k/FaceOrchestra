import * as THREE from "three";
import { applyHonkPitchMask, updateHonkPitchColor } from "../../scene/honkPitchColor.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  INTERACTION_TARGET_NAMES,
  INTERACTION_TYPES,
  MORPH_TARGET_NAMES,
} from "../../config/honk.js";
import { LOOPER_COMPONENT_ID, LOOPER_CONTROL_MORPH_TARGETS } from "../../config/looper.js";
import { MODEL_LABEL_SETTINGS, NOTE_LABEL_SETTINGS } from "../../config/ui.js";
import { METRONOME_LABEL_SETTINGS } from "../../config/metronome.js";
import {
  VOWEL_LETTERS_BY_MORPH,
  VOWEL_MORPHS,
} from "../../instruments/honk/HonkInteractionProfile.js";
import {
  CHROMATIC_NOTE_NAMES,
  F4_MIDI_NOTE,
  HONK_PITCH_SNAP_STEPS,
} from "../../instruments/honk/HonkTuning.js";
import { getLooperLabelText } from "../../instruments/looper/looperLabel.js";
import { getLooperControlName } from "../../instruments/looper/looperNames.js";
import {
  HIT_MARKER_OPACITY,
  getInteractionTargetColor,
} from "../../ui/interactionTargetPresentation.js";
import {
  applyInstrumentLockedTexture,
  resolveInstrumentLockTextureSet,
} from "../../scene/instrumentLockTexturePolicy.js";

export class HonkPresentationRuntime {
  constructor(host) {
    this.host = host;
    this.currentVowelIndex = -1;
    this.currentVowelLetter = "neutral";
    this.labelWorldScale = new THREE.Vector3();
  }
  updateMetronomes(now = performance.now()) {
    for (const metronome of this.host.instrumentRegistry.getByKind("metronome")) {
      metronome.update(now);
      this.updateMetronomeLabel(metronome);
    }
  }
  positionMetronomeControls(state) {
    if (state?.kind !== "metronome") return;
    state.handleRig?.setValue("bpm", state.bpm);
    state.handleRig?.setValue("volume", state.volume);
  }
  updateLooperTempoLabel(state, now = performance.now()) {
    if (!state?.looperData) return;
    const text = getLooperLabelText(state, now);
    this.updateModelTextLabel(state, "looper", text, MODEL_LABEL_SETTINGS);
  }
  createMetronomeLabel(state) {
    this.updateMetronomeLabel(state);
  }
  updateMetronomeLabel(state) {
    if (state?.kind !== "metronome") return;
    this.updateModelTextLabel(
      state,
      "metronome",
      `${Math.round(state.bpm)} BPM`,
      METRONOME_LABEL_SETTINGS,
    );
  }
  updateModelTextLabel(state, prefix, text, settings) {
    if (!this.host.noteFont) return;
    const groupKey = prefix + "LabelGroup",
      meshKey = prefix + "LabelMesh",
      textKey = prefix + "LabelTextValue";
    let group = state[groupKey];
    if (!group) {
      group = new THREE.Group();
      group.name = prefix.toUpperCase() + "_label";
      group.userData.isNoteLabel = true;
      group.rotation.x = THREE.MathUtils.degToRad(MODEL_LABEL_SETTINGS.rotationDegrees.x);
      this.positionModelTextLabel(state, group);
      state.root.add(group);
      state[groupKey] = group;
    }
    this.updateModelTextLabelScale(state, group);
    if (state[textKey] === text) return;
    if (state[meshKey]) this.disposeNoteLabelMesh(state[meshKey]);
    const mesh = this.createTextLabelMesh(text, settings);
    mesh.name = prefix.toUpperCase() + "_label_text";
    group.add(mesh);
    state[meshKey] = mesh;
    state[textKey] = text;
  }
  positionModelTextLabel(state, group) {
    const bounds = new THREE.Box3(),
      box = new THREE.Box3(),
      looperVertices = state.kind === "looper" ? [] : null;
    state.root.updateWorldMatrix(true, true);
    const inverse = state.root.matrixWorld.clone().invert(),
      matrix = new THREE.Matrix4(),
      vertex = new THREE.Vector3();
    state.root.traverse((object) => {
      if (!object.isMesh || !object.geometry) return;
      for (let node = object; node && node !== state.root; node = node.parent) {
        if (
          !node.visible ||
          node.userData.isNoteLabel ||
          node.userData.isMetronomeDebug ||
          node.name.startsWith("DEBUG_") ||
          (node.userData.isHitTarget && !node.userData.usesVisibleMeshForGrip)
        )
          return;
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.every((m) => !m || !m.visible || m.opacity === 0 || m.wireframe)) return;
      matrix.multiplyMatrices(inverse, object.matrixWorld);
      box.makeEmpty();
      const count = object.geometry.attributes.position?.count || 0;
      for (let i = 0; i < count; i++) {
        object.getVertexPosition(i, vertex);
        box.expandByPoint(vertex.applyMatrix4(matrix));
        if (looperVertices) looperVertices.push(vertex.x, vertex.y);
      }
      bounds.union(box);
    });
    if (bounds.isEmpty()) {
      group.userData.modelLabelAnchor = { x: 0, y: 0.4 };
      this.updateModelTextLabelScale(state, group);
      return;
    }
    let centerX = (bounds.min.x + bounds.max.x) / 2;
    if (looperVertices?.length) {
      // Center over the upper cup, excluding the crank and arms below it.
      const topY = bounds.max.y - (bounds.max.y - bounds.min.y) * 0.15;
      let minX = Infinity,
        maxX = -Infinity;
      for (let i = 0; i < looperVertices.length; i += 2) {
        if (looperVertices[i + 1] < topY) continue;
        minX = Math.min(minX, looperVertices[i]);
        maxX = Math.max(maxX, looperVertices[i]);
      }
      if (Number.isFinite(minX)) centerX = (minX + maxX) / 2;
    }
    group.userData.modelLabelAnchor = { x: centerX, y: bounds.max.y };
    this.updateModelTextLabelScale(state, group);
  }
  updateModelTextLabelScale(state, group) {
    if (!group || !state?.root?.getWorldScale) return;
    state.root.getWorldScale(this.labelWorldScale);
    const { x, y, z } = this.labelWorldScale;
    const previous = group.userData.labelWorldScale;
    if (previous && previous[0] === x && previous[1] === y && previous[2] === z) return;
    group.userData.labelWorldScale = [x, y, z];
    group.scale.set(
      1 / Math.max(Math.abs(x), 0.0001),
      1 / Math.max(Math.abs(y), 0.0001),
      1 / Math.max(Math.abs(z), 0.0001),
    );
    const anchor = group.userData.modelLabelAnchor;
    if (anchor)
      group.position.set(
        anchor.x,
        anchor.y + (MODEL_LABEL_SETTINGS.gap + MODEL_LABEL_SETTINGS.size * 0.6) * group.scale.y,
        0,
      );
  }
  createTextLabelMesh(text, settings = NOTE_LABEL_SETTINGS) {
    const lines = text.split("\n");
    const rows = lines.map((line, index) => {
      const row = new TextGeometry(line, {
        font: this.host.noteFont,
        size: settings.size,
        depth: settings.depth,
        curveSegments: settings.curveSegments,
      });
      row.computeBoundingBox();
      const bounds = row.boundingBox;
      // Center each row independently. Stack upward so the bottom row keeps
      // the same clearance above the instrument as a single-line label.
      if (bounds)
        row.translate(
          -(bounds.min.x + bounds.max.x) / 2,
          -(bounds.min.y + bounds.max.y) / 2 + (lines.length - index - 1) * settings.size * 1.4,
          0,
        );
      return row;
    });
    const geometry = rows.length === 1 ? rows[0] : mergeGeometries(rows);
    if (rows.length > 1) for (const row of rows) row.dispose();
    geometry.computeBoundingBox();
    geometry.userData.disposeOnInstrumentDelete = true;
    geometry.userData.disposeWithOwner = true;
    const material = new THREE.MeshStandardMaterial({
      color: settings.color,
      roughness: 0.36,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    material.userData.disposeOnInstrumentDelete = true;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.isNoteLabel = true;
    mesh.raycast = () => {};
    mesh.castShadow = true;
    return mesh;
  }
  getSignedMorphValueForCollider(sphere, state) {
    const type = sphere.userData.interactionType;

    if (!state?.getMorphValue) return 0;

    if (type === INTERACTION_TYPES.ear) {
      return state.getEarAmount?.(sphere.userData.side) ?? 0;
    }

    if (type === INTERACTION_TYPES.nose) {
      const value = this.getMorphValue(sphere.userData.morphName || MORPH_TARGET_NAMES.nose, state);

      return sphere.userData.invertVerticalMorph ? -value : value;
    }

    const positiveName = sphere.userData.positiveMorphName || sphere.userData.morphName;
    const negativeName = sphere.userData.negativeMorphName;

    const positive = positiveName ? this.getMorphValue(positiveName, state) : 0;

    const negative = negativeName ? this.getMorphValue(negativeName, state) : 0;

    const signedValue = positive - negative;

    return sphere.userData.invertVerticalMorph ? -signedValue : signedValue;
  }
  syncMorphColliderTravel(state) {
    if (!state?.getMorphValue) return;

    const spheres = this.getProceduralMorphTargetSpheres(state);

    for (const sphere of spheres) {
      if (
        typeof sphere.userData.neutralY !== "number" ||
        typeof sphere.userData.minY !== "number" ||
        typeof sphere.userData.maxY !== "number"
      ) {
        continue;
      }

      const signedValue = THREE.MathUtils.clamp(
        this.getSignedMorphValueForCollider(sphere, state),
        -1,
        1,
      );

      this.setSpherePositionFromSignedValue(sphere, signedValue);
    }

    if (state.kind !== "looper") {
      return;
    }

    for (const [control, fallbackMorphTargets] of Object.entries(LOOPER_CONTROL_MORPH_TARGETS)) {
      const sphere = state.hitTargets[getLooperControlName(control)];
      if (!sphere?.userData.isLooperControl) {
        continue;
      }

      const morphTargets = sphere.userData.looperMorphTargets || fallbackMorphTargets;
      const signedValue = THREE.MathUtils.clamp(
        this.getMorphValue(morphTargets.up, state) - this.getMorphValue(morphTargets.down, state),
        -1,
        1,
      );

      this.host.positionControlColliderFromValue(sphere, signedValue);
    }
  }
  getProceduralMorphTargetSpheres(state) {
    return state.hitTargetList.filter((target) => target.userData.isProceduralMorphTarget);
  }
  setSpherePositionFromMorph(sphere, morphValue) {
    sphere.position.y = THREE.MathUtils.lerp(
      sphere.userData.minY,
      sphere.userData.maxY,
      sphere.userData.invertVerticalMorph
        ? 1 - THREE.MathUtils.clamp(morphValue, 0, 1)
        : THREE.MathUtils.clamp(morphValue, 0, 1),
    );
  }
  setSpherePositionFromSignedValue(sphere, signedValue) {
    const value = THREE.MathUtils.clamp(signedValue, -1, 1);

    const neutralY = sphere.userData.neutralY;
    const minY = sphere.userData.minY;
    const maxY = sphere.userData.maxY;

    if (typeof neutralY !== "number" || typeof minY !== "number" || typeof maxY !== "number") {
      return;
    }

    sphere.position.y =
      value >= 0
        ? THREE.MathUtils.lerp(neutralY, maxY, value)
        : THREE.MathUtils.lerp(neutralY, minY, -value);
  }
  setInstrumentLockedTexture(instrumentState, locked) {
    const textureSet = this.getTextureSetForInstrumentState(instrumentState);
    const changed = applyInstrumentLockedTexture(instrumentState, locked, textureSet, {
      swapMaterial: (material, targetMap) => this.getTextureSwapMaterial(material, targetMap),
    });
    // Lock swaps the painted areas; the bulb keeps its independent note color.
    updateHonkPitchColor(instrumentState, this.host.instrumentMaterialTextures?.pitchMask);
    return changed;
  }
  getTextureSetForInstrumentState(instrumentState) {
    return resolveInstrumentLockTextureSet(instrumentState, {
      honk: this.host.instrumentMaterialTextures,
      looper: this.host.looperMaterialTextures,
      looperComponentId: LOOPER_COMPONENT_ID,
    });
  }
  getTextureSwapMaterial(material, targetMap) {
    if (!material) {
      return material;
    }

    const targetMaterial = material.userData.lockTextureUniqueMaterial
      ? material
      : material.clone();
    targetMaterial.userData = {
      ...targetMaterial.userData,
      lockTextureUniqueMaterial: true,
      disposeOnInstrumentDelete: true,
    };
    targetMaterial.map = targetMap;
    applyHonkPitchMask(
      targetMaterial,
      material.honkPitchMask,
      material.userData.honkPitchBaseColor,
    );
    targetMaterial.needsUpdate = true;
    return targetMaterial;
  }
  updateLockVisual(instrumentState) {
    this.setInstrumentLockedTexture(instrumentState, instrumentState?.locked);
    this.setLockIndicatorVisible(instrumentState, false);
  }
  setLockIndicatorVisible(instrumentState, visible) {
    const bodyTarget = instrumentState?.hitTargets?.[INTERACTION_TARGET_NAMES.body];
    if (!bodyTarget?.material || bodyTarget.userData?.usesVisibleMeshForGrip) {
      return;
    }

    const baseOpacity =
      typeof bodyTarget.userData.baseHitOpacity === "number"
        ? bodyTarget.userData.baseHitOpacity
        : HIT_MARKER_OPACITY;
    bodyTarget.userData.lockIndicatorVisible = false;
    bodyTarget.material.color.setHex(getInteractionTargetColor(bodyTarget));
    bodyTarget.material.opacity = baseOpacity;
    bodyTarget.material.transparent = true;
    bodyTarget.material.depthWrite = false;
  }
  getMorphValue(morphName, state = this.host.activeInstrumentState) {
    if (!state) {
      return 0;
    }
    return state.getMorphValue?.(morphName) ?? 0;
  }
  setMorph(morphName, value, state = this.host.activeInstrumentState) {
    if (!state) {
      return;
    }
    state.setMorphValue?.(morphName, value);
    this.syncMorphColliderTravel(state);
  }
  createNoteLabel(state) {
    if (!NOTE_LABEL_SETTINGS.enabled || !this.host.noteFont || state?.kind !== "honk") {
      return;
    }

    const group = new THREE.Group();
    group.name = "NOTE_label";
    group.userData.isNoteLabel = true;
    this.applyNoteLabelTransform(group);
    state.root.add(group);
    state.noteLabelGroup = group;
    this.positionModelTextLabel(state, group);
    this.updateNoteLabel(state);
    if (this.host.tutorial?.session) this.host.tutorial.adapter.labelPresentation.styleNote(state);
  }
  applyNoteLabelTransform(group) {
    const position = NOTE_LABEL_SETTINGS.position || {};
    const rotationDegrees = NOTE_LABEL_SETTINGS.rotationDegrees || {};
    const scale = NOTE_LABEL_SETTINGS.scale || {};

    group.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
    group.rotation.set(
      THREE.MathUtils.degToRad(rotationDegrees.x ?? 0),
      THREE.MathUtils.degToRad(rotationDegrees.y ?? 0),
      THREE.MathUtils.degToRad(rotationDegrees.z ?? 0),
    );
    group.scale.set(scale.x ?? 1, scale.y ?? 1, scale.z ?? 1);
  }
  updateNoteLabel(state) {
    updateHonkPitchColor(state, this.host.instrumentMaterialTextures?.pitchMask);
    if (!NOTE_LABEL_SETTINGS.enabled || !this.host.noteFont || !state?.noteLabelGroup) {
      return;
    }

    this.updateModelTextLabelScale(state, state.noteLabelGroup);
    const labelText = this.getNoteLabelText(state);
    if (labelText === state.noteLabelTextValue) {
      return;
    }

    if (state.noteLabelMesh) {
      this.disposeNoteLabelMesh(state.noteLabelMesh);
      state.noteLabelMesh = null;
    }

    const mesh = this.createTextLabelMesh(labelText);
    mesh.name = "NOTE_label_text";
    state.noteLabelGroup.add(mesh);
    state.noteLabelMesh = mesh;
    state.noteLabelTextValue = labelText;
  }
  disposeNoteLabelMesh(mesh) {
    mesh.removeFromParent();
    mesh.geometry?.dispose?.();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      material?.dispose?.();
    }
  }
  getNoteLabelText(state) {
    const leftEar = state.getEarAmount("left");
    const rightEar = state.getEarAmount("right");
    const pitchSemitones = this.getPitchSemitonesFromLeftEar(leftEar, state.pitchSnap);
    const octave = THREE.MathUtils.mapLinear(THREE.MathUtils.clamp(rightEar, -1, 1), -1, 1, 2, 6);
    const midi = Math.round(F4_MIDI_NOTE + pitchSemitones + (octave - 4) * 12);
    const noteIndex = THREE.MathUtils.euclideanModulo(midi, CHROMATIC_NOTE_NAMES.length);
    const octaveNumber = Math.floor(midi / 12) - 1;
    const noteName = state.scalePresetNote || CHROMATIC_NOTE_NAMES[noteIndex];
    return NOTE_LABEL_SETTINGS.showOctave ? `${noteName}${octaveNumber}` : noteName;
  }
  getPitchSemitonesFromLeftEar(leftEar, pitchSnap = null) {
    const pitchControl = THREE.MathUtils.clamp(leftEar, -1, 1);
    const rawPitchSemitones =
      pitchControl < 0
        ? THREE.MathUtils.mapLinear(pitchControl, -1, 0, -5, 0)
        : THREE.MathUtils.mapLinear(pitchControl, 0, 1, 0, 7);
    const snapSteps = HONK_PITCH_SNAP_STEPS[pitchSnap];
    if (!snapSteps) {
      return rawPitchSemitones;
    }
    return snapSteps.reduce(
      (closest, step) =>
        Math.abs(step - rawPitchSemitones) < Math.abs(closest - rawPitchSemitones) ? step : closest,
      snapSteps[0],
    );
  }
  setVowel(vowelMorphName, state = this.host.activeInstrumentState) {
    if (!state) {
      return;
    }

    const vowelLetter = VOWEL_LETTERS_BY_MORPH[vowelMorphName] || null;
    this.applyVowelLetterToState(vowelLetter, state);
  }
  setVowelByLetter(vowelLetter, state = this.host.activeInstrumentState) {
    this.applyVowelLetterToState(vowelLetter, state);
  }
  applyVowelLetterToState(
    vowelLetter,
    state = this.host.activeInstrumentState,
    { updateLiveState = true, updateAudio = true } = {},
  ) {
    if (!state) {
      return;
    }

    const normalized = vowelLetter && vowelLetter !== "neutral" ? vowelLetter : null;
    const vowelMorphName = normalized ? MORPH_TARGET_NAMES.vowels[normalized] : null;
    state.applyVowelMorph?.(normalized);
    state.currentVowelIndex = vowelMorphName ? VOWEL_MORPHS.indexOf(vowelMorphName) : -1;
    state.currentVowelLetter = normalized || "neutral";
    if (state === this.host.activeInstrumentState) {
      this.currentVowelIndex = state.currentVowelIndex;
      this.currentVowelLetter = state.currentVowelLetter;
    }
    if (updateLiveState) {
      state.setVowel?.(state.currentVowelLetter);
    }
    if (updateAudio) state.setAudioVowel?.(normalized);
  }
  cycleVowel(state = this.host.activeInstrumentState) {
    if (!state) {
      return;
    }

    const nextIndex = (state.currentVowelIndex + 1) % VOWEL_MORPHS.length;
    const vowelMorphName = VOWEL_MORPHS[nextIndex];
    this.applyVowelLetterToState(VOWEL_LETTERS_BY_MORPH[vowelMorphName], state);
  }
}
