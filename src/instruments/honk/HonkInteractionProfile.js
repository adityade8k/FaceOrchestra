import { INTERACTION_TARGET_NAMES, MORPH_TARGET_NAMES } from "../../config/honk.js";

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

export const VOWEL_LETTERS_BY_MORPH = Object.freeze(
  Object.fromEntries(Object.entries(MORPH_TARGET_NAMES.vowels).map(([letter, morph]) => [morph, letter])),
);
