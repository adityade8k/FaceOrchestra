import value from "./rishte-naate/composition.json" with { type: "json" };
import { validateRishte } from "./MelodyScore.js";
import { FixedBackingEnsemble } from "../tutorial/FixedBackingEnsemble.js";
import { songAdapter } from "./SongAdapter.js";

export const definition = validateRishte(value);
export const { createEnsemble, createGuidance, enterTutorial, selectArrangement } = songAdapter(definition, FixedBackingEnsemble);
