import value from "./kuch-honk-orchestra/composition.json" with { type: "json" };
import { validateKuchOrchestra } from "../tutorial/kuch-orchestra/score.js";
import { FixedBackingEnsemble } from "../tutorial/FixedBackingEnsemble.js";
import { songAdapter } from "./SongAdapter.js";

export const definition = validateKuchOrchestra(value);
export const { createEnsemble, createGuidance, enterTutorial, selectArrangement } = songAdapter(definition, FixedBackingEnsemble);
