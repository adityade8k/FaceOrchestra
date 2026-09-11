import { INTERACTION_TARGET_NAMES, MORPH_TARGET_NAMES } from "../../config/honk.js";
import { HONK_INTERACTION_ROLES } from "./HonkInstrument.js";

export const HONK_INTERACTION_PROFILE = Object.freeze({
  [INTERACTION_TARGET_NAMES.mouth]: Object.freeze({
    type: "clickCycleVowel",
    morphs: Object.freeze(Object.values(MORPH_TARGET_NAMES.vowels)),
  }),
  [INTERACTION_TARGET_NAMES.horn]: Object.freeze({
    type: "holdSqueeze",
    morph: MORPH_TARGET_NAMES.squeeze,
  }),
  [INTERACTION_TARGET_NAMES.nose]: Object.freeze({
    type: "verticalDragMorph",
    morph: MORPH_TARGET_NAMES.nose,
    dragType: "nose",
  }),
  [INTERACTION_TARGET_NAMES.leftEar]: Object.freeze({
    type: "verticalDragMorph",
    dragType: "ear",
    side: "left",
  }),
  [INTERACTION_TARGET_NAMES.rightEar]: Object.freeze({
    type: "verticalDragMorph",
    dragType: "ear",
    side: "right",
  }),
  [INTERACTION_TARGET_NAMES.body]: Object.freeze({ type: "gripTransform" }),
});

export const VOWEL_MORPHS = HONK_INTERACTION_PROFILE[INTERACTION_TARGET_NAMES.mouth].morphs;

// Acquisition and captured-gesture validation share this contract. A body/grip
// hit (including a locked body's hit) never grants squeeze ownership.
export function isHonkSqueezeTarget(honk, target) {
  if (honk?.kind !== "honk" || honk.disposed || honk.pendingPlacement ||
      !honk.root?.parent || !target || target.name !== INTERACTION_TARGET_NAMES.horn ||
      HONK_INTERACTION_PROFILE[target.name]?.type !== "holdSqueeze" ||
      honk.getTarget?.(HONK_INTERACTION_ROLES.squeeze) !== target) return false;
  const record = honk.interactionTargetRegistry?.resolveFromObject3D(target, { walkParents: false });
  if (!record || record.object3D !== target || record.ownerId !== honk.id ||
      record.role !== HONK_INTERACTION_ROLES.squeeze) return false;
  let attachedToHonk = false;
  for (let object = target; object; object = object.parent) {
    if (object.visible === false) return false;
    if (object === honk.root) attachedToHonk = true;
  }
  return attachedToHonk;
}

export const VOWEL_LETTERS_BY_MORPH = Object.freeze(
  Object.fromEntries(Object.entries(MORPH_TARGET_NAMES.vowels).map(([letter, morph]) => [morph, letter])),
);
