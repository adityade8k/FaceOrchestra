import { FORMATION_SPAWN_SETTINGS } from "../../config/formations.js";

export const HONK_TUNING_SETS = Object.freeze({
  cMajorScale: Object.freeze([
    note("C", -5), note("D", -3), note("E", -1), note("F", 0),
    note("G", 2), note("A", 4), note("B", 6), note("C", 7),
  ]),
  fNaturalMinorScale: Object.freeze([
    note("F", 0), note("G", 2), note("Ab", 3), note("Bb", 5),
    note("C", 7), note("Db", -4, 1), note("Eb", -2, 1), note("F", 0, 1),
  ]),
  fSharpNaturalMinorScale: Object.freeze([
    note("F#", 1), note("G#", 3), note("A", 4), note("B", 6),
    note("C#", -4, 1), note("D", -3, 1), note("E", -1, 1), note("F#", 1, 1),
  ]),
  cMajorChord: Object.freeze([note("C", -5), note("E", -1), note("G", 2)]),
  gMajorChord: Object.freeze([note("G", 2), note("B", 6), note("D", -3, 1)]),
  fMajorChord: Object.freeze([note("F", 0), note("A", 4), note("C", -5, 1)]),
  aMinorChord: Object.freeze([note("A", 4), note("C", -5, 1), note("E", -1, 1)]),
  cMajorTwoOctaves: Object.freeze([
    note("C", -5), note("D", -3), note("E", -1), note("F", 0),
    note("G", 2), note("A", 4), note("B", 6),
    note("C", -5, 1), note("D", -3, 1), note("E", -1, 1), note("F", 0, 1),
    note("G", 2, 1), note("A", 4, 1), note("B", 6, 1),
    note("C", -5, 2),
  ]),
});

const RECIPE_DEFINITIONS = [
  ["honk-cmajor", "C Major Scale", "cMajorScale", "Honk"],
  ["honk-fminor", "F Minor Scale", "fNaturalMinorScale", "HonkFm"],
  ["honk-fsharpminor", "F# Minor Scale", "fSharpNaturalMinorScale", "HonkFSharpMinor"],
  ["chord-cmajor", "C Major", "cMajorChord", "CMaj"],
  ["chord-gmajor", "G Major", "gMajorChord", "GMaj"],
  ["chord-fmajor", "F Major", "fMajorChord", "FMaj"],
  ["chord-aminor", "A Minor", "aMinorChord", "AMin"],
  ["preset-cmajor-two-octaves", "C Major 2 Oct", "cMajorTwoOctaves", "C2Oct"],
];

export const FORMATION_RECIPES = Object.freeze(
  RECIPE_DEFINITIONS.map(([id, label, tuningSetId, namePrefix]) =>
    createFormationRecipe({ id, label, tuningSetId, namePrefix })),
);

export const FORMATION_RECIPE_BY_ID = new Map();
for (const recipe of FORMATION_RECIPES) {
  FORMATION_RECIPE_BY_ID.set(recipe.id, recipe);
  FORMATION_RECIPE_BY_ID.set(recipe.tuningSetId, recipe);
}

export function getFormationRecipe(idOrTuningSet) {
  return FORMATION_RECIPE_BY_ID.get(idOrTuningSet) || null;
}

export function createFormationRecipe({
  id,
  label,
  tuningSetId,
  namePrefix = "Honk",
  spacing = FORMATION_SPAWN_SETTINGS.memberSpacing,
} = {}) {
  const notes = HONK_TUNING_SETS[tuningSetId];
  if (!notes) {
    throw new Error(`Unknown honk tuning set: ${tuningSetId}`);
  }
  const firstOffset = -((notes.length - 1) * spacing) * 0.5;
  return Object.freeze({
    id,
    kind: "formation-recipe",
    label,
    tuningSetId,
    namePrefix,
    members: Object.freeze(notes.map((tuning, index) => Object.freeze({
      tuning,
      position: Object.freeze([firstOffset + index * spacing, 0, 0]),
    }))),
  });
}

function note(label, semitonesFromF, octaveOffset = 0) {
  return Object.freeze({
    note: label,
    label,
    semitonesFromF,
    octaveOffset,
  });
}
