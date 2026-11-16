// One registry owns suite selection, environment requirements and shared follow-ups.
const script = (file, coverage, cost = "targeted", environment = "Chrome + local server") => ({
  file,
  coverage,
  cost,
  environment,
  kind: "script",
});
const browserModule = (
  file,
  entry,
  coverage,
  { app = true, cost = "targeted", after = [], timeoutMs = 600000 } = {},
) => ({
  file,
  entry,
  coverage,
  app,
  cost,
  after,
  timeoutMs,
  kind: "module",
  environment: "Chrome + local server",
});
const honkFollowups = ["manual-honks", "presentation"];
export const browserSuites = Object.freeze({
  music: browserModule(
    "validate-music-menu-browser.mjs",
    "validate",
    "Musical recipes, preview cleanup, Play/Jog/simulation transitions",
    { cost: "smoke" },
  ),
  "scene-density": script(
    "./check-scene-density-browser.mjs",
    "8/32/64/128-Honk CPU/render baseline",
    "profile",
  ),
  alfaaz: script("./check-alfaaz-browser.mjs", "Alfaaz arrangement and recording"),
  nazariya: script("./check-nazariya-browser.mjs", "Nazariya arrangement and bends"),
  "note-squares": script("./check-note-squares-browser.mjs", "Note-square guidance"),
  "rishte-human": script("./check-rishte-human-browser.mjs", "Rishte human practice timing"),
  sustain: script("./check-sustain-cues-browser.mjs", "Sustain guidance timing"),
  "tu-kisi": script("./check-tu-kisi-rail-si-browser.mjs", "Tu Kisi Rail Si arrangement"),
  "branch-texture": script("./capture/check-branch-texture.mjs", "Captured branch texture"),
  "chunked-playback": script("./capture/check-chunked-playback.mjs", "Chunked capture playback"),
  compositions: script(
    "./check-compositions-browser.mjs",
    "Shared song library, lessons and recordings",
    "full",
  ),
  basics: script("./run-basics-browser.mjs", "Basics lesson flow and isolation", "full"),
  "basics-finale": script(
    "./check-basics-finale-browser.mjs",
    "Basics finale and retained takes",
    "full",
  ),
  jog: script("./capture/check-jog.mjs", "Jog capture playback", "full"),
  capture: script("./capture/run-browser.mjs", "Capture and editor integration", "full"),
  "capture-server": script(
    "./capture/check-server.mjs",
    "Receiver durability, origin and private-path boundaries",
    "targeted",
    "Node + local server",
  ),
  "capture-long": script("./capture/check-long-editor.mjs", "Long capture/editor behavior", "long"),
  "recording-demo": script("./check-recording-demo-browser.mjs", "Recorded demonstration fidelity"),
  tutorial: browserModule("validate-tutorial-browser.mjs", "validate", "Complete Jog tutorial", {
    cost: "full",
    after: honkFollowups,
  }),
  ports: browserModule(
    "validate-port-groups-browser.mjs",
    "validate",
    "Clock port groups and switching",
    { after: honkFollowups },
  ),
  recording: browserModule(
    "validate-looper-recording-browser.mjs",
    "validateStandalone",
    "Looper recording integration",
    { after: honkFollowups },
  ),
  radial: browserModule(
    "validate-tutorial-radial-browser.mjs",
    "validateStandalone",
    "Learner radial placement",
    { cost: "full", after: honkFollowups },
  ),
  "tutorial-panel": script(
    "./check-tutorial-panel-browser.mjs",
    "Tutorial panel controls and layout",
  ),
  frame: script("./check-frame-browser.mjs", "Instrument layout frame"),
  audit: script("./audit-browser.mjs", "Cross-mode recovery and lifecycle stress", "full"),
  profile: script("./run-tutorial-profile.mjs", "Tutorial phase CPU baseline", "profile"),
  rays: script("./check-ray-play-browser.mjs", "Manual ray targeting and bend lock"),
  articulation: script(
    "./check-honk-articulation-browser.mjs",
    "Live/scheduled Web Audio waveforms and release",
  ),
  percussion: script("./check-percussion-browser.mjs", "Percussion audio and routing"),
  "honk-color": script("./check-honk-color-browser.mjs", "Pitch and lock texture appearance"),
  "manual-honks": browserModule(
    "validate-manual-honks-browser.mjs",
    "validate",
    "Manual Honk interaction and audio",
    { app: false },
  ),
  presentation: browserModule(
    "validate-honk-presentation-browser.mjs",
    "validate",
    "Authoritative and rendered Honk poses",
    { app: false },
  ),
  "manual-profile": browserModule(
    "benchmark-manual-honks-browser.mjs",
    "benchmark",
    "Small-scene interaction/audio baseline",
    { app: false, cost: "profile" },
  ),
});

export function planBrowserSuites(requested, registry = browserSuites) {
  const pending = [...requested],
    seen = new Set(),
    plan = [];
  while (pending.length) {
    const id = pending.shift();
    if (!registry[id]) throw new Error(`Unknown browser suite: ${id}. Use --list to see suites.`);
    if (seen.has(id)) continue;
    seen.add(id);
    plan.push(id);
    // Shared follow-ups run after all explicitly requested suites, once each.
    pending.push(...(registry[id].after || []));
  }
  return plan;
}

// Compatibility for existing scripts; new callers select ports/recording/radial directly.
export function tutorialSuiteFromEnvironment(environment = process.env) {
  const id = environment.TUTORIAL_TEST || "tutorial";
  if (!["tutorial", "ports", "recording", "radial"].includes(id))
    throw new Error(`Unknown TUTORIAL_TEST: ${id}`);
  return id;
}
