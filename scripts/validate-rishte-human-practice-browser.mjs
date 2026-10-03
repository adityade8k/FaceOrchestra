// Runs inside the real browser app. Synthetic controllers use the ordinary ray
// and trigger route; only this test labels their practice gestures as learner.
export async function validate() {
  const { r, t, d, check, wait } = window.__rishte;
  const a = t.adapter, metro = a.get("metronome");
  d.index = 0; d.cancel(); metro.setBpm(75);
  const originalUpdate = d.update.bind(d);
  let current = null, changed = false, phaseError = 0, backingDrift = 0;
  d.update = now => {
    if (d.phase === "practice") {
      const beat = d.ensemble.beatAt(now);
      if (!changed && beat > 2.55) {
        const before = d.ensemble.beatAt(performance.now());
        metro.setBpm(60);
        phaseError = Math.abs(d.ensemble.beatAt(performance.now()) - before);
        changed = true;
      }
      if (changed && beat > 2.8 && beat < 7.8) for (const h of d.ensemble.loopers.filter(h => h.transport.playing)) {
        const sourceBeat = h.looperController.getAbsoluteSourcePosition(h, now) / 800;
        backingDrift = Math.max(backingDrift, Math.abs(sourceBeat - beat));
      }
      const event = d.guide.step.events.find(e => beat >= e.beat && beat < e.beat + e.beats);
      if (event?.id !== current) {
        a.squeeze(null, false, 0, now); r.updateHorn(now); a.observe(now); current = event?.id;
      }
      if (event) a.squeeze(event.role, true, 0, now);
    }
    originalUpdate(now);
  };
  await t.action("step-practice"); a.setVirtualsActive(true, "learner");
  const deadline = performance.now() + 17000;
  while (d.phase && performance.now() < deadline) await wait(40);
  d.update = originalUpdate;
  check(!d.phase && d.outcomes[d.step.id] === "passed", `Practice assessment failed: ${d.feedback}`);
  check(changed && phaseError < .01, "Tempo change moved the beat phase");
  check(backingDrift < .01, "Looper drift after tempo change: " + backingDrift);
  const practice = { feedback: d.feedback, observations: d.heard.length, phaseErrorBeats: phaseError,
    backingDriftAfterTempoChangeBeats: backingDrift, tempoHistory: d.ensemble.history };
  // Retry begins a fresh count-in and does not immediately retain a passing take.
  await t.action("step-practice"); check(d.heard.length === 0, "Retry reused observations");
  const retryDeadline = performance.now() + 15000;
  while (d.phase && performance.now() < retryDeadline) await wait(40);
  check(!d.phase && d.outcomes[d.step.id] === "retry", "Empty retry assessment: " + d.feedback);

  // A real recording captured with the normal Looper record/trigger path must
  // survive temporary example loads, navigation and cancellation.
  const h = a.get("foundation-0"), c = h.looperController;
  metro.beatOriginMs = null; metro.play(performance.now());
  c.startRecording(h, performance.now());
  a.setVirtualsActive(true, "learner"); a.squeeze("backing-49", true);
  await wait(550); a.squeeze(null, false); await wait(180); c.stopRecording(h, performance.now());
  a.setVirtualsActive(false); metro.pause();
  check(h.timeline.hasRecording(), "Real learner recording missing");
  const take = JSON.stringify(c.serializeState(h));
  await t.action("rishte-preview"); await wait(1200); await t.action("rishte-stop");
  check(JSON.stringify(c.serializeState(h)) === take, "Preview lost learner take");
  await t.action("next-step"); await t.action("previous-step");
  check(JSON.stringify(c.serializeState(h)) === take, "Navigation lost learner take");
  await t.action("rishte-preview"); await wait(200); c.startRecording(h, performance.now()); await wait(180);
  check(!d.phase && JSON.stringify(c.serializeState(h)) === take, "Cancelled record arm lost the original learner take");

  // If the learner replaces a take while an example is active, revision checks
  // cancel the example and preserve the new state instead of restoring over it.
  await t.action("rishte-preview"); await wait(300);
  c.clearRecording(h); await wait(180);
  check(!d.phase && !h.timeline.hasRecording(), "Changed take overwritten by demo cleanup");
  const changedTakeFeedback = d.feedback;
  await t.action("rishte-preview"); await wait(350); metro.pause(); await wait(150);
  check(!d.phase, "Metronome stop did not stop the tutorial");

  // A later two-bar practice window contains an internal one-bar handoff.
  d.index = d.definition.lessons.findIndex(l => l.startBeat === 112);
  d.cancel(); metro.setBpm(115);
  await t.action("step-practice"); await wait(6900);
  check(!d.phase && d.feedback.startsWith("0/6 matched"), "Later phrase did not finish: " + d.feedback);
  check(d.ensemble.handoffs.length === 1, "Internal phrase handoff missing");
  d.index = d.definition.lessons.length - 1; d.cancel();
  check(d.step.completePerformance, "Complete melody lesson missing");
  await t.action("step-practice"); await wait(300); await t.action("exit");
  check(!t.dataTutorial && r.instrumentRegistry.size === 0, "Exit failed to restore Play");

  // Preserve a pre-existing Play workspace with a recorded take, too.
  r.createSpawnedComponent("honk", { name: "Learner workspace Honk" }); const savedHonk = r.activeInstrumentState;
  r.createSpawnedComponent("looper", { name: "Learner workspace take" }); const savedLooper = r.activeInstrumentState;
  r.connectLooperTrackToHonk(savedLooper, 1, savedHonk.id);
  const { compilePattern } = await import("../src/compositions/CompositionCompiler.js");
  const seed = compilePattern({ events: [{ role: "seed", beat: 0, beats: .75 }], beats: 2, beatMs: 700,
    routes: { seed: { trackId: savedLooper.tracks[1].trackId, trackIndex: 1 } } });
  savedLooper.looperController.restoreState(savedLooper, { timeline: seed.toJSON(), controls: { recordBeats: 2, gap: -1, volume: -.2 } }, { preserveConnections: true });
  const saved = r.sceneSerializer.serialize();
  await t.action("tutorials"); await t.action("composition:rishte-naate");
  await t.action("rishte-preview"); await wait(200); await t.action("exit");
  check(JSON.stringify(r.sceneSerializer.serialize()) === JSON.stringify(saved), "Play workspace take changed");
  await t.action("record-songs"); await t.action("composition:rishte-naate");
  check(t.jogRecording?.composition.contentVersion === 2, "Record Songs did not load the revised arrangement");
  await t.enterPlay();
  return { practice, emptyRetryRejected: true, learnerTakePreserved: true, cancelledRecordArmPreserved: true, changedTakeFeedback,
    metronomeStop: true, laterPhraseHandoff: true, completeLesson: true, cleanExit: true,
    playWorkspaceRestored: true, recordSongsVersion: 2 };
}
