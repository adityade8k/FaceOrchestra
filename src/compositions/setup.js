import { COMPOSITION, TUTORIAL_PRESETS, TUTORIAL_LOOPERS } from "./songs/jog/definition.js";
import { tuningForMidi } from "../instruments/honk/HonkTuning.js";
import { getFormationRecipe } from "../instruments/formations/formationRecipes.js";
import { SPAWN_CATALOG_ENTRIES, SPAWN_RADIAL_CATEGORIES } from "../config/spawning.js";
import { SpawnCatalog } from "../spawning/SpawnCatalog.js";

// Composition setup supplies song formations to the ordinary spawning services.
export function createCompositionSetup() {
  const formations = new Map(
    TUTORIAL_PRESETS.map((preset) => [
      preset.id,
      {
        id: preset.id,
        kind: "formation-recipe",
        label: preset.label,
        namePrefix: preset.id,
        members: preset.midis.map((midi, index) => ({
          tuning: tuningForMidi(midi),
          position: [(index - (preset.midis.length - 1) / 2) * preset.spacing, 0, 0],
        })),
      },
    ]),
  );
  const entries = [
    ...SPAWN_CATALOG_ENTRIES,
    ...TUTORIAL_LOOPERS.map((p) => ({
      id: p.catalogId,
      label: p.label,
      componentId: "looper",
      action: "instrument",
    })),
    ...TUTORIAL_PRESETS.map((p) => ({
      id: p.id,
      label: p.role === "melody" ? "Jog Study" : p.label,
      action: "formation",
      recipeId: p.id,
    })),
  ];
  const categories = SPAWN_RADIAL_CATEGORIES.map((category) => ({
    ...category,
    childIds:
      category.id === "category-chords"
        ? COMPOSITION.backing.map((group) => group.catalogId)
        : category.id === "category-scales"
          ? [...category.childIds, "jog-melody"]
          : category.childIds,
  }));
  return {
    catalog: new SpawnCatalog(entries, categories),
    recipes: { get: (id) => formations.get(id) || getFormationRecipe(id) },
  };
}
