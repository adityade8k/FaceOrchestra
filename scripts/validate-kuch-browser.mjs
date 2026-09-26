import { MELODY, CHORDS, DRUMS, BEAT_MS } from "../src/tutorial/kuch/score.js";

// Run against a dedicated visible browser: validate((await import('/src/main.js')).app).
// Uses normal wall time, frame phases, controller observations and Web Audio.
export async function validate(app, { onProgress = () => {} } = {}) {
  const t = app.runtime.tutorial,
    r = app.runtime;
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (fn, timeout) => {
    const start = performance.now();
    while (!fn()) {
      check(performance.now() - start < timeout, "Browser tutorial timed out");
      await wait(100);
    }
  };
  if (t.session || t.kuch) await t.enterPlay();
  const before = r.sceneSerializer.serialize();
  await r.audioSystem.ensureAudio();
  const originalGain = r.audioSystem.masterBus.output.gain.value;
  await t.action("tutorials");
  check(
    t.catalog.list().some((a) => a.id === "virag-2-jog-study") &&
      t.catalog.list().some((a) => a.id === "kuch-to-hua-hai"),
    "Both tutorials must be available",
  );
  await t.router.enter(
    "tutorials:kuch-to-hua-hai",
    () => t.catalog.load("kuch-to-hua-hai"),
    async (module) => {
      t.navigationScreen = null;
      await module.enterTutorial(t, true);
    },
  );
  const k = t.kuch,
    events = [],
    phases = new Map();
  check(k?.phase, "Kuch simulation did not start");
  const accept = k.accept.bind(k);
  k.accept = (e) => {
    events.push({ ...e, phase: k.phase?.id });
    accept(e);
  };
  const audio = r.audioSystem,
    analyser = audio.audioContextService.context.createAnalyser(),
    samples = new Float32Array(2048);
  audio.masterBus.output.connect(analyser);
  let peak = 0,
    raf,
    patternSwitches = [],
    lastPattern = null;
  const switches = [];
  let queuedSeen = false;
  const observedSwitches = new Set();
  const sample = () => {
    analyser.getFloatTimeDomainData(samples);
    for (const v of samples) peak = Math.max(peak, Math.abs(v));
    if (k.phase && !phases.has(k.phase.id)) {
      phases.set(k.phase.id, performance.now());
      onProgress(k.phase.id);
    }
    if (
      k.phase?.kind === "performance" &&
      k.activePattern &&
      k.activePattern !== lastPattern
    ) {
      patternSwitches.push({
        pattern: k.activePattern,
        beat: (performance.now() - k.anchor) / BEAT_MS,
      });
      lastPattern = k.activePattern;
    }
    for (const role of ["chordLooper", "alternativeLooper"]) {
      const data = t.adapter.get(role)?.looperData;
      if (!data) continue;
      queuedSeen ||= data.queued;
      for (const event of data.switchHistory)
        if (!observedSwitches.has(event.id)) {
          observedSwitches.add(event.id);
          switches.push({
            ...event,
            phase: [...phases]
              .reverse()
              .find(([, at]) => at <= event.requestedAtMs)?.[0],
          });
        }
    }
    raf = requestAnimationFrame(sample);
  };
  sample();
  try {
    await until(() => !k.running, 180000);
    check(
      k.report?.completed && k.report.step === "performance",
      `Simulation stopped: ${k.feedback}`,
    );
    const leads = events.filter(
      (e) => e.phase === "performance" && e.kind === "note",
    );
    check(
      leads.length === MELODY.length,
      `Expected 185 live melody notes, observed ${leads.length}`,
    );
    for (let i = 0; i < leads.length; i++) {
      check(
        leads[i].midis.length === 1 &&
          Math.abs(leads[i].midis[0] - MELODY[i].midi) < 0.2,
        `Wrong live pitch at note ${i}`,
      );
      check(
        leads[i].voiced && leads[i].released,
        `Note ${i} did not sound and release`,
      );
      check(
        Math.abs(
          (leads[i].endMs - leads[i].startMs) / BEAT_MS - MELODY[i].beats,
        ) < 0.15,
        `Note ${i} duration drifted`,
      );
    }
    const hits = events.filter(
      (e) => e.phase === "drums" && e.kind === "strike",
    );
    check(
      hits.length === DRUMS.length &&
        hits.every((e) => e.withdrawn && e.recordedCount === 1),
      "Every percussion hit must contact, record once and withdraw",
    );
    for (const bank of ["D", "change"]) {
      const played = events.filter(
        (e) => e.phase === bank && e.kind === "note",
      );
      check(
        played.length === CHORDS[bank].length,
        `Incomplete chord pattern ${bank}: ${played.length}`,
      );
    }
    check(patternSwitches.length === 7, "Expected seven harmony selections");
    check(
      queuedSeen &&
        switches.filter((e) => e.phase === "switch-patterns").length === 2,
      "Switch exercise must use two actual handoffs",
    );
    const songSwitches = switches.filter((e) => e.phase === "performance");
    check(songSwitches.length === 6, "Expected six actual song handoffs");
    check(
      songSwitches.every((e) => e.beat % 16 === songSwitches[0].beat % 16),
      "Song changes must share complete-cycle boundaries",
    );
    check(
      peak > 0 && peak < 1,
      `Audio must sound without clipping; peak ${peak}`,
    );
    check(
      ["chordLooper", "alternativeLooper", "percussionLooper"].every(
        (role) =>
          !t.adapter.get(role).transport.playing &&
          !t.adapter.get(role).transport.recording,
      ),
      "Loopers did not stop",
    );
    check(
      !t.adapter.get("metronome").playing && !k.queue.length,
      "Clock or conductor is still active",
    );
    const report = {
      melodyNotes: leads.length,
      percussionHits: hits.length,
      patternSwitches,
      switches,
      queuedSeen,
      peak,
      phases: [...phases.keys()],
    };
    // A learner attempt followed by a demo must not silently replace their saved take.
    k.index = 0;
    await t.action("step-practice");
    const old = k.attemptTake;
    await t.action("step-practice");
    check(
      JSON.stringify(k.take("chordLooper")) === JSON.stringify(old),
      "Cancelled count-in changed the take",
    );
    cancelAnimationFrame(raf);
    await t.enterPlay();
    await wait(200);
    check(
      Math.abs(audio.masterBus.output.gain.value - originalGain) < 0.001,
      "Exit did not restore the output level",
    );
    check(
      JSON.stringify(r.sceneSerializer.serialize()) === JSON.stringify(before),
      "Exit did not restore the free-play scene",
    );
    check(
      !document.querySelector(".kuch-keyboard"),
      "Lesson controls survived Exit",
    );
    return { ...report, sceneRestored: true, cancelPreservedTake: true };
  } finally {
    cancelAnimationFrame(raf);
    audio.masterBus.output.disconnect(analyser);
    analyser.disconnect();
    if (t.kuch?.running) t.kuch.cancel("Browser verification stopped.");
  }
}
