import { MELODY, CHORDS, DRUMS, BEAT_MS } from "../src/tutorial/kuch/score.js";
import { assessKuchNote } from "../src/tutorial/kuch/assessment.js";
import { ARRANGEMENTS } from "../src/tutorial/kuch/arrangements.js";

// Run against a dedicated visible browser: validate((await import('/src/main.js')).app).
// Uses normal wall time, frame phases, controller observations and Web Audio.
export async function validate(
  app,
  { onProgress = () => {}, arrangementId = "easier-bends" } = {},
) {
  const arrangement = ARRANGEMENTS[arrangementId];
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
    async () =>
      (await t.catalog.load("kuch-to-hua-hai")).selectArrangement(
        arrangementId,
      ),
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
  const bendVoices = new Map(),
    audioBends = new Map();
  let ringChecks = 0,
    bendRingChecks = 0,
    menuHiddenChecked = false,
    menuRestored = false,
    performanceAnchor = null;
  let renderedGuide = null,
    renderedBeat = null;
  const updateCues = t.cues.update;
  t.cues.update = function (guide, now, options) {
    renderedGuide = guide;
    renderedBeat = guide?.beatAt?.(now) ?? null;
    return updateCues.call(this, guide, now, options);
  };
  let queuedSeen = false;
  const observedSwitches = new Set();
  const sample = () => {
    analyser.getFloatTimeDomainData(samples);
    for (const v of samples) peak = Math.max(peak, Math.abs(v));
    if (k.phase && !phases.has(k.phase.id)) {
      phases.set(k.phase.id, performance.now());
      if (k.phase.kind === "performance") performanceAnchor = k.anchor;
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
    if (k.phase?.kind === "performance") {
      const now = performance.now(),
        beat = (now - k.anchor) / BEAT_MS;
      if (beat > 4 && !menuHiddenChecked) {
        t.menu.setVisible(false);
        menuHiddenChecked = true;
      }
      if (beat > 16 && !menuRestored) {
        t.menu.setVisible(true);
        menuRestored = true;
      }
      // The renderer uses the frame timestamp. Sampling performance.now() later
      // can cross a repeated-note onset and inspect the next frame's countdown.
      const next =
        renderedGuide && renderedGuide === k.guide
          ? k.phase.events.find((e) => e.beat > renderedBeat)
          : null;
      if (
        next &&
        next.beat - renderedBeat > 0.07 &&
        next.beat - renderedBeat < 0.95
      ) {
        if (
          !t.cues.pool.some(
            (p) => p.green.visible && p.green.userData.eventId === next.id,
          )
        )
          sampleFailure = `Missing green ${next.id} at rendered beat ${renderedBeat}`;
        ringChecks++;
      }
      if (t.adapter.focusRing.visible)
        sampleFailure = "Legacy focus ring competes with shared timing cues";
      const expected = k.phase.events.find((e) => e.id === k.note);
      if (expected?.bend) {
        const h = t.adapter.get(expected.role),
          controller = t.adapter.virtuals[0];
        const voice = audio.honkVoices.voices.get(
          r.getInstrumentVoiceId(r.getControllerVoiceId(controller), h),
        );
        if (voice) {
          if (
            bendVoices.has(expected.id) &&
            bendVoices.get(expected.id) !== voice
          )
            sampleFailure = `Voice restarted during ${expected.id}`;
          bendVoices.set(expected.id, voice);
          const points = audioBends.get(expected.id) || [];
          const offsetMs = now - k.anchor - expected.beat * BEAT_MS;
          if (!points.length || offsetMs - points.at(-1).offsetMs >= 30)
            points.push({
              offsetMs,
              midi:
                69 +
                12 * Math.log2(voice.source.frequency.value / 440) +
                voice.source.detune.value / 100,
            });
          audioBends.set(expected.id, points);
        }
        if (
          renderedGuide && renderedGuide === k.guide &&
          renderedBeat > expected.beat + 0.07 &&
          renderedBeat < expected.endBeat - 0.07
        ) {
          if (
            !t.cues.pool.some(
              (p) =>
                p.yellow.visible &&
                p.yellow.userData.role === expected.role &&
                t.cues.gauge.root.visible,
            )
          )
            sampleFailure = `Bend guidance left its starting Honk: ${expected.id}`;
          bendRingChecks++;
        }
      }
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
  let sampleFailure = null;
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
      leads.length === arrangement.events.length,
      `Expected ${arrangementId === "original" ? 185 : 167} melody gestures, observed ${leads.length}`,
    );
    for (let i = 0; i < leads.length; i++) {
      check(
        leads[i].midis.length === 1 &&
          Math.abs(leads[i].midis[0] - arrangement.events[i].midi) < 0.2,
        `Wrong live pitch at note ${i}`,
      );
      check(
        leads[i].voiced && leads[i].released,
        `Note ${i} did not sound and release`,
      );
      check(
        Math.abs(
          (leads[i].endMs - leads[i].startMs) / BEAT_MS -
            arrangement.events[i].beats,
        ) < 0.15,
        `Note ${i} duration drifted`,
      );
      const pitch = assessKuchNote(
        arrangement.events[i],
        leads[i],
        performanceAnchor,
      );
      check(
        pitch.ok,
        `Sounded-pitch assessment failed at ${arrangement.events[i].id}: ${pitch.reason}`,
      );
    }
    check(!sampleFailure, sampleFailure);
    check(
      ringChecks > 100 && menuHiddenChecked && menuRestored,
      "Musical cues were not exercised with the menu hidden",
    );
    check(
      Object.keys(k.results).length === 0,
      "Demonstration awarded learner credit",
    );
    const landmarks = arrangement.events.flatMap((e) => e.sourceEventIds);
    check(
      landmarks.length === 185 && new Set(landmarks).size === 185,
      "All 185 source pitch landmarks must remain",
    );
    const audible = [];
    for (const e of arrangement.events.filter((e) => e.bend)) {
      const points = audioBends.get(e.id) || [],
        destination = e.transition.destinationMidi;
      const settled = points.filter(
        (p) =>
          p.offsetMs >= e.transition.landmarkOffsetBeats * BEAT_MS &&
          Math.abs(p.midi - destination) < 0.5,
      );
      check(
        settled.length >= 3 &&
          settled.at(-1).offsetMs - settled[0].offsetMs >= 60,
        `No audible destination hold: ${e.id}`,
      );
      check(
        settled[0].offsetMs <= e.transition.landmarkOffsetBeats * BEAT_MS + 225,
        `Audio landing too late: ${e.id}`,
      );
      audible.push({
        id: e.id,
        landmark: e.transition.destinationMidi,
        landingMs:
          settled[0].offsetMs - e.transition.landmarkOffsetBeats * BEAT_MS,
        settledMs: settled.at(-1).offsetMs - settled[0].offsetMs,
      });
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
      arrangementId,
      sourcePitchLandmarks: landmarks.length,
      ringChecks,
      bendRingChecks,
      audible,
      menuHiddenGuidance: true,
      demonstrationCredit: false,
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
    t.cues.update = updateCues;
    audio.masterBus.output.disconnect(analyser);
    analyser.disconnect();
    if (t.kuch?.running) t.kuch.cancel("Browser verification stopped.");
  }
}
