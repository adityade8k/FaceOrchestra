import value from "./definition.json" with { type: "json" };
import { validateAlfaaz } from "./score.js";
import { FixedBackingEnsemble } from "../../../tutorial/FixedBackingEnsemble.js";
import { songAdapter } from "../../SongAdapter.js";

export class AlfaazEnsemble extends FixedBackingEnsemble {
  validateDefinition() {
    validateAlfaaz(this.definition);
  }
}
export const definition = validateAlfaaz(value);
export const { createEnsemble, createGuidance, enterTutorial, selectArrangement } = songAdapter(
  definition,
  AlfaazEnsemble,
);
