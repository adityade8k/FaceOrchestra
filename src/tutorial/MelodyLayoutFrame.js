import { InstrumentLayoutFrame } from "./InstrumentLayoutFrame.js";
import { tuningForMidi } from "../instruments/honk/HonkTuning.js";

export class MelodyLayoutFrame extends InstrumentLayoutFrame {
  constructor(ensemble, options = {}) {
    const melodyRoles = new Set(ensemble.definition.score.events.map((e) => e.role));
    const fullPalette = ensemble.definition.playback === "honk-live-two-hand-v1";
    super(ensemble, {
      title: "Melody",
      recipes: ensemble.definition.arrangement.recipes.filter(
        (p) => p.kind === "honk" && (fullPalette || p.part === "melody" || melodyRoles.has(p.role)),
      ),
      restoreMember: (recipe, baseScale) => {
        const { r, a, host } = ensemble;
        if (
          !r.createSpawnedComponent("honk", {
            name: recipe.role,
            baseScale,
            tuning: tuningForMidi(recipe.midi),
          })
        ) {
          if (host.dataTutorial)
            host.dataTutorial.feedback = `Could not restore ${recipe.role}. Free some space and press Reset again.`;
          host.lastDraw = -Infinity;
          return null;
        }
        const h = r.activeInstrumentState;
        a.roles.set(recipe.role, [h.id]);
        a.labelPresentation.styleNote(h);
        return h;
      },
      ...options,
    });
  }
}
