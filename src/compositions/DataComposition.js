import { validateComposition } from "./CompositionRegistry.js";
import { GenericTutorial } from "../tutorial/GenericTutorial.js";
import { validateDataArrangement } from "./DataValidation.js";
import { DataEnsemble, DataGuidance } from "./DataEnsemble.js";
export { DataEnsemble, DataGuidance };

export async function loadDataComposition(url, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`Composition load failed (${response.status})`);
  return dataComposition(await response.json());
}
export function dataComposition(value) {
  const definition = validateDataArrangement(validateComposition(value));
  return {
    definition,
    createEnsemble: (host) => new DataEnsemble(host, definition),
    createGuidance: (anchor) => new DataGuidance(definition, anchor),
    enterTutorial: async (host) => {
      host.freePlayScene ??= host.r.sceneSerializer.serialize();
      host.adapter.clear();
      host.dataTutorial = new GenericTutorial(host, definition);
      host.dataTutorial.prepare();
      host.r.sessionMode = "practice";
    },
  };
}
