export async function validate(app) {
  const r = app.runtime;
  await r.tutorial.navigation.enterPlay();
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const expected = {
    "honk-cmajor": ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"],
    "honk-fminor": ["F4", "G4", "G#4", "A#4", "C5", "C#5", "D#5", "F5"],
    "honk-fsharpminor": ["F#4", "G#4", "A4", "B4", "C#5", "D5", "E5", "F#5"],
    "chord-aminor": ["A4", "C4", "E5"],
    "chord-emajor": ["E3", "B4", "G#4"],
    "chord-cmajor": ["C4", "E4", "G4"],
    "chord-dminor": ["F4", "A4", "D5"],
    "chord-gmajor": ["G4", "B4", "D5"],
    "chord-fmajor": ["F4", "A4", "C5"],
    "chord-eminor": ["E4", "G4", "B4"],
    "chord-dmajor": ["D4", "F#4", "A4"],
  };
  const { noteNameFromControls } = await import("../../src/instruments/honk/HonkTuning.js");
  const controller = r.controllers[0];
  const categories = r.spawn.spawnCatalog.getRadialCategories();
  check(
    categories.find((c) => c.id === "category-chords").entries.length === 8,
    "Eight chords required",
  );
  const before = r.instrumentRegistry.getByKind("honk").length;
  for (const [id, notes] of Object.entries(expected)) {
    check(r.spawn.spawnCatalog.get(id).visibleInRadial, `${id} is hidden`);
    r.spawn.beginPendingSpawnPlacement(controller, id);
    const preview = r.spawn.pendingSpawnPlacement;
    check(!!preview, `${id} did not preview`);
    const actual = preview.instruments.map((h) =>
      noteNameFromControls(h.tuning.pitchControl, h.tuning.octaveControl),
    );
    check(JSON.stringify(actual) === JSON.stringify(notes), `${id}: ${actual}`);
    r.spawn.deletePendingSpawnPlacement();
    check(
      r.instrumentRegistry.getByKind("honk").length === before,
      `${id} leaked cancelled members`,
    );
  }
  for (let cycle = 0; cycle < 3; cycle++) {
    await r.tutorial.enter("practice");
    check(
      r.spawn.spawnCatalog.get("jog-group-1").visibleInRadial,
      "Jog lesson lost its chord menu",
    );
    for (const c of r.controllers) {
      check(
        c.userData.radialMenu.userData.childRings.get("category-chords").userData.segments
          .length === 4,
        "Jog visual menu is stale",
      );
    }
    await r.tutorial.navigation.enterPlay();
    check(!r.spawn.spawnCatalog.get("jog-group-1").visibleInRadial, "Jog menu leaked into Play");
    for (const c of r.controllers) {
      check(
        c.userData.radialMenu.userData.childRings.get("category-chords").userData.segments
          .length === 8,
        "Play visual menu is stale",
      );
    }
  }
  for (let cycle = 0; cycle < 2; cycle++) {
    await r.tutorial.enter("simulation");
    check(
      r.tutorial.adapter.virtuals.every((c) => !c.userData.radialMenu),
      "Simulation controllers acquired spawn menus",
    );
    await r.tutorial.navigation.enterPlay();
    check(
      r.tutorial.adapter.virtuals.every((c) => !c.userData.radialMenu),
      "Leaving simulation attached spawn menus to virtual controllers",
    );
  }
  return {
    recipes: Object.keys(expected).length,
    modeRoundTrips: 3,
    simulationRoundTrips: 2,
    cancelledPreviewsCleaned: true,
  };
}
