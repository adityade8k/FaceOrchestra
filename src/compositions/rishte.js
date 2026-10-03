import value from "./rishte-naate/human-composition.json" with { type: "json" };
import { RishteEnsemble } from "../tutorial/rishte/RishteEnsemble.js";
import { RishteTutorial } from "../tutorial/rishte/RishteTutorial.js";
import { RishteGuidance, validateRishte } from "../tutorial/rishte/score.js";

export const definition = validateRishte(value);
let recordingEnsemble;
export function createEnsemble(host) {
  return recordingEnsemble = new RishteEnsemble(host, definition);
}
export function createGuidance() {
  return new RishteGuidance(recordingEnsemble, definition);
}
export async function enterTutorial(host) {
  host.freePlayScene ??= host.r.sceneSerializer.serialize();
  host.dataTutorial = new RishteTutorial(host, definition);
  host.dataTutorial.prepare();
  host.r.sessionMode = "practice";
}
