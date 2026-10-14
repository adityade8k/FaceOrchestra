import value from "./nazariya-honk-bends/composition.json" with { type: "json" };
import { validateLiveMelody } from "../tutorial/live-melody/score.js";
import { LiveMelodyEnsemble } from "../tutorial/live-melody/LiveMelodyEnsemble.js";
import { songAdapter } from "./SongAdapter.js";

export const definition = validateLiveMelody(value);
export const { createEnsemble, createGuidance, enterTutorial, selectArrangement } = songAdapter(definition, LiveMelodyEnsemble);
