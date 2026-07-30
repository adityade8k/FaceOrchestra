import * as THREE from "three";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import {
  INTERACTION_TARGET_NAMES,
  INTERACTION_TYPES,
  MORPH_TARGET_NAMES,
} from "../../config/honk.js";
import {
  LOOPER_COMPONENT_ID,
  LOOPER_CONTROL_MORPH_TARGETS,
} from "../../config/looper.js";
import { NOTE_LABEL_SETTINGS } from "../../config/ui.js";
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
import { getLooperControlName } from "../../instruments/looper/looperNames.js";
import {
  HIT_MARKER_OPACITY,
  getInteractionTargetColor,
} from "../../ui/interactionTargetPresentation.js";

export const HonkPresentationRuntimeMethods = {
    updateMetronomes(now = performance.now()) {
      for (const metronome of this.instrumentRegistry.getByKind("metronome")) metronome.update(now);
    },
    positionMetronomeControls(state) {
      if (state?.kind !== "metronome") return;
      state.handleRig?.setValue("bpm", state.bpm);
      state.handleRig?.setValue("volume", state.volume);
    },
    createMetronomeLabel(state) {
      if (state?.kind !== "metronome") return;
      const settings = METRONOME_LABEL_SETTINGS;
      const group = new THREE.Group();
      group.name = "METRONOME_bpm_label";
      group.userData.isNoteLabel = true;
      group.position.set(settings.position.x, settings.position.y, settings.position.z);
      group.rotation.set(
        THREE.MathUtils.degToRad(settings.rotationDegrees.x),
        THREE.MathUtils.degToRad(settings.rotationDegrees.y),
        THREE.MathUtils.degToRad(settings.rotationDegrees.z),
      );
      const canvas = document.createElement("canvas");
      canvas.width = settings.canvasWidth;
      canvas.height = settings.canvasHeight;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      material.userData.disposeOnInstrumentDelete = true;
      const sprite = new THREE.Sprite(material);
      sprite.name = "METRONOME_bpm_text";
      sprite.scale.set(settings.spriteWidth, settings.spriteHeight, 1);
      sprite.renderOrder = 30;
      group.add(sprite);
      state.root.add(group);
      state.metronomeLabelGroup = group;
      state.metronomeLabelCanvas = canvas;
      state.metronomeLabelTexture = texture;
      state.metronomeLabelMesh = sprite;
      this.updateMetronomeLabel(state);
    },
    updateMetronomeLabel(state) {
      if (!state?.metronomeLabelGroup) return;
      const labelText = `${Math.round(state.bpm)} BPM`;
      if (labelText === state.metronomeLabelTextValue) return;
      const settings = METRONOME_LABEL_SETTINGS;
      const canvas = state.metronomeLabelCanvas;
      const context = canvas?.getContext?.("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = `#${settings.color.toString(16).padStart(6, "0")}`;
      context.font = settings.font;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(labelText, canvas.width * 0.5, canvas.height * 0.5);
      state.metronomeLabelTexture.needsUpdate = true;
      state.metronomeLabelTextValue = labelText;
    },
    getSignedMorphValueForCollider(sphere, state) {
      const type = sphere.userData.interactionType;
  
      if (!state?.getMorphValue) return 0;
  
      if (type === INTERACTION_TYPES.ear) {
        return state.getEarAmount?.(sphere.userData.side) ?? 0;
      }
  
      if (type === INTERACTION_TYPES.nose) {
        const value = this.getMorphValue(
          sphere.userData.morphName || MORPH_TARGET_NAMES.nose,
          state,
        );
  
        return sphere.userData.invertVerticalMorph ? -value : value;
      }
  
      const positiveName = sphere.userData.positiveMorphName || sphere.userData.morphName;
      const negativeName = sphere.userData.negativeMorphName;
  
      const positive = positiveName
        ? this.getMorphValue(positiveName, state)
        : 0;
  
      const negative = negativeName
        ? this.getMorphValue(negativeName, state)
        : 0;
  
      const signedValue = positive - negative;
  
      return sphere.userData.invertVerticalMorph ? -signedValue : signedValue;
    },
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
          1
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
  
        this.positionControlColliderFromValue(sphere, signedValue);
      }
    },
    getProceduralMorphTargetSpheres(state) {
      return state.hitTargetList.filter(
        (target) => target.userData.isProceduralMorphTarget,
      );
    },
    setSpherePositionFromMorph(sphere, morphValue) {
      sphere.position.y = THREE.MathUtils.lerp(
        sphere.userData.minY,
        sphere.userData.maxY,
        sphere.userData.invertVerticalMorph
          ? 1 - THREE.MathUtils.clamp(morphValue, 0, 1)
          : THREE.MathUtils.clamp(morphValue, 0, 1),
      );
    },
    setSpherePositionFromSignedValue(sphere, signedValue) {
      const value = THREE.MathUtils.clamp(signedValue, -1, 1);
  
      const neutralY = sphere.userData.neutralY;
      const minY = sphere.userData.minY;
      const maxY = sphere.userData.maxY;
  
      if (
        typeof neutralY !== "number" ||
        typeof minY !== "number" ||
        typeof maxY !== "number"
      ) {
        return;
      }
  
      sphere.position.y =
        value >= 0
          ? THREE.MathUtils.lerp(neutralY, maxY, value)
          : THREE.MathUtils.lerp(neutralY, minY, -value);
    },
    setInstrumentLockedTexture(instrumentState, locked) {
      if (!instrumentState?.root) {
        return;
      }
  
      const textureSet = this.getTextureSetForInstrumentState(instrumentState);
      const baseMap = textureSet?.baseMap;
      const lockedBaseMap = textureSet?.lockedBaseMap;
      if (!baseMap || !lockedBaseMap) {
        return;
      }
  
      const useLockedTexture = Boolean(locked);
      if (instrumentState.lockedTextureApplied === useLockedTexture) {
        return;
      }
  
      const targetMap = useLockedTexture ? lockedBaseMap : baseMap;
      instrumentState.root.traverse((object) => {
        if (
          !object.isMesh ||
          object.userData.isHitTarget ||
          object.userData.isNoteLabel ||
          object.name.startsWith("DEBUG_") ||
          !object.material
        ) {
          return;
        }
  
        object.material = Array.isArray(object.material)
          ? object.material.map((material) => this.getTextureSwapMaterial(material, targetMap))
          : this.getTextureSwapMaterial(object.material, targetMap);
      });
      instrumentState.lockedTextureApplied = useLockedTexture;
    },
    getTextureSetForInstrumentState(instrumentState) {
      if (instrumentState?.kind === "looper" || instrumentState?.componentId === LOOPER_COMPONENT_ID) {
        return this.looperMaterialTextures;
      }
      return this.instrumentMaterialTextures;
    },
    getTextureSwapMaterial(material, targetMap) {
      if (!material) {
        return material;
      }
  
      const targetMaterial = material.userData.lockTextureUniqueMaterial ? material : material.clone();
      targetMaterial.userData = {
        ...targetMaterial.userData,
        lockTextureUniqueMaterial: true,
        disposeOnInstrumentDelete: true,
      };
      targetMaterial.map = targetMap;
      targetMaterial.needsUpdate = true;
      return targetMaterial;
    },
    updateLockVisual(instrumentState) {
      this.setInstrumentLockedTexture(instrumentState, instrumentState?.locked);
      this.setLockIndicatorVisible(instrumentState, false);
    },
    setLockIndicatorVisible(instrumentState, visible) {
      const bodyTarget = instrumentState?.hitTargets?.[INTERACTION_TARGET_NAMES.body];
      if (!bodyTarget?.material) {
        return;
      }
  
      const baseOpacity =
        typeof bodyTarget.userData.baseHitOpacity === "number" ? bodyTarget.userData.baseHitOpacity : HIT_MARKER_OPACITY;
      bodyTarget.userData.lockIndicatorVisible = false;
      bodyTarget.material.color.setHex(getInteractionTargetColor(bodyTarget));
      bodyTarget.material.opacity = baseOpacity;
      bodyTarget.material.transparent = true;
      bodyTarget.material.depthWrite = false;
    },
    getMorphValue(morphName, state = this.activeInstrumentState) {
      if (!state) {
        return 0;
      }
      return state.getMorphValue?.(morphName) ?? 0;
    },
    setMorph(morphName, value, state = this.activeInstrumentState) {
      if (!state) {
        return;
      }
      state.setMorphValue?.(morphName, value);
      this.syncMorphColliderTravel(state);
    },
    createNoteLabel(state) {
      if (!NOTE_LABEL_SETTINGS.enabled || !this.noteFont || state?.kind !== "honk") {
        return;
      }
  
      const group = new THREE.Group();
      group.name = "NOTE_label";
      group.userData.isNoteLabel = true;
      this.applyNoteLabelTransform(group);
      state.root.add(group);
      state.noteLabelGroup = group;
      this.updateNoteLabel(state);
    },
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
    },
    updateNoteLabel(state) {
      if (!NOTE_LABEL_SETTINGS.enabled || !this.noteFont || !state?.noteLabelGroup) {
        return;
      }
  
      const labelText = this.getNoteLabelText(state);
      if (labelText === state.noteLabelTextValue) {
        return;
      }
  
      if (state.noteLabelMesh) {
        this.disposeNoteLabelMesh(state.noteLabelMesh);
        state.noteLabelMesh = null;
      }
  
      const geometry = new TextGeometry(labelText, {
        font: this.noteFont,
        size: NOTE_LABEL_SETTINGS.size,
        depth: NOTE_LABEL_SETTINGS.depth,
        curveSegments: NOTE_LABEL_SETTINGS.curveSegments,
      });
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (bounds) {
        const centerX = (bounds.min.x + bounds.max.x) * 0.5;
        const centerY = (bounds.min.y + bounds.max.y) * 0.5;
        geometry.translate(-centerX, -centerY, 0);
      }
      geometry.userData.disposeOnInstrumentDelete = true;
  
      const material = new THREE.MeshStandardMaterial({
        color: NOTE_LABEL_SETTINGS.color,
        roughness: 0.36,
        metalness: 0.02,
        side: THREE.DoubleSide,
      });
      material.userData.disposeOnInstrumentDelete = true;
  
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "NOTE_label_text";
      mesh.userData.isNoteLabel = true;
      mesh.castShadow = true;
      mesh.renderOrder = 30;
      state.noteLabelGroup.add(mesh);
      state.noteLabelMesh = mesh;
      state.noteLabelTextValue = labelText;
    },
    disposeNoteLabelMesh(mesh) {
      mesh.removeFromParent();
      mesh.geometry?.dispose?.();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        material?.dispose?.();
      }
    },
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
    },
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
      return snapSteps.reduce((closest, step) =>
        Math.abs(step - rawPitchSemitones) < Math.abs(closest - rawPitchSemitones) ? step : closest,
        snapSteps[0]);
    },
    setVowel(vowelMorphName, state = this.activeInstrumentState) {
      if (!state) {
        return;
      }
  
      const vowelLetter = VOWEL_LETTERS_BY_MORPH[vowelMorphName] || null;
      this.applyVowelLetterToState(vowelLetter, state);
    },
    setVowelByLetter(vowelLetter, state = this.activeInstrumentState) {
      this.applyVowelLetterToState(vowelLetter, state);
    },
    applyVowelLetterToState(
      vowelLetter,
      state = this.activeInstrumentState,
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
      if (state === this.activeInstrumentState) {
        this.currentVowelIndex = state.currentVowelIndex;
        this.currentVowelLetter = state.currentVowelLetter;
      }
      if (updateLiveState) {
        state.setVowel?.(state.currentVowelLetter);
      }
      if (updateAudio) state.setAudioVowel?.(normalized);
    },
    cycleVowel(state = this.activeInstrumentState) {
      if (!state) {
        return;
      }
  
      const nextIndex = (state.currentVowelIndex + 1) % VOWEL_MORPHS.length;
      const vowelMorphName = VOWEL_MORPHS[nextIndex];
      this.applyVowelLetterToState(VOWEL_LETTERS_BY_MORPH[vowelMorphName], state);
    },
};
