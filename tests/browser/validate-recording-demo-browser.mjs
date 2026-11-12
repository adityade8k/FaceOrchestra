export async function validate(app, id) {
  const THREE = await import("three");
  const r = app.runtime,
    t = r.tutorial;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await t.navigation.enterPlay();
  const before = JSON.stringify(r.sceneSerializer.serialize().instruments);
  await t.navigation.selectComposition(id, "record-songs");
  const mode = t.recording.session,
    ensemble = mode.ensemble;
  mode.trackingReady = () => true;
  const start = r.capture.startReady.bind(r.capture);
  r.capture.startReady = (options) => start({ ...options, synthetic: true });
  r.capture.includeUI = true; // The guided take must override this optional debug setting.
  r.capture.syntheticXR = {
    viewer: { p: [0, 1.6, 0], q: [0, 0, 0, 1] },
    controllers: ["left", "right"].map((hand, i) => ({
      handedness: hand,
      profiles: ["physical-pose-fixture"],
      grip: { p: [i ? 0.2 : -0.2, 1.2, -0.2], q: [0, 0, 0, 1] },
      ray: { p: [i ? 0.2 : -0.2, 1.2, -0.27], q: [0, 0, 0, 1] },
      buttons: [[0, 0, 0]],
      axes: [0, 0],
    })),
  };
  const originals = [],
    attacks = [];
  try {
    await r.capture.pair("123456");
    await mode.action("prepare");
    check(mode.phase === "ready", mode.feedback);
    // Let the headless browser's output device settle before anchoring PCM.
    await wait(1000);
    t.backingLayout.update();
    const frame = t.backingLayout.frame;
    const events =
      mode.composition.score.events ||
      mode.composition.arrangement.liveEvents.filter((e) => e.pitch);
    const melodyRoles = new Set(events.map((e) => e.role));
    const melodyPoses = [...melodyRoles].map((role) => [
      role,
      t.adapter.get(role).root.position.clone(),
    ]);
    const backingTakes = r.instrumentRegistry
      .getByKind("looper")
      .map((h) => [
        h,
        h.timeline,
        JSON.stringify(h.timeline.toJSON()),
        h.tracks.map((track) => track.connectedHonkId),
      ]);
    if (backingTakes.length) {
      check(frame, "Backing frame missing");
      check(
        backingTakes.every(([h]) => frame.members.includes(h)),
        "A backing Looper is outside the frame",
      );
      check(frame.members.includes(t.adapter.get("metronome")), "Metronome is outside the frame");
      check(
        melodyPoses.every(([role]) => !frame.members.includes(t.adapter.get(role))),
        "Backing frame includes melody",
      );
      const initial = frame.members.map((h) => [h, h.root.position.clone()]);
      const delta = new THREE.Vector3(-0.15, 0.07, -0.12);
      frame.apply(
        frame.root.position.clone().add(delta),
        1,
        frame.root.quaternion
          .clone()
          .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.12)),
      );
      check(
        initial.every(([h, p]) => h.root.position.distanceTo(p) > 0.02),
        "Backing member did not move",
      );
      check(
        melodyPoses.every(([role, p]) => t.adapter.get(role).root.position.distanceTo(p) < 1e-8),
        "Melody moved with backing",
      );
      ensemble.validate();
    }
    for (const role of melodyRoles) {
      const h = t.adapter.get(role),
        original = h.startAudioVoice.bind(h);
      h.startAudioVoice = (...args) => {
        attacks.push(role);
        return original(...args);
      };
      originals.push([h, original]);
    }
    await t.action("jog-record-demonstrate");
    check(mode.phase === "count-in", `Demonstrate did not start: ${mode.feedback}`);
    check(r.capture.presentation.includeUI === false, "Guided recording captured debug UI");
    check(
      mode.demonstrating && mode.guidance(mode.anchor.countAt)?.mode === "demonstration",
      "Demonstration did not retain headset guidance",
    );
    const visible = { nextNote: false, activeNote: false, sustain: false, bend: false };
    const seconds = (mode.melodyGuide.step.beats * 60000) / mode.bpm / 1000;
    const deadline = performance.now() + (seconds + 35) * 1000;
    while (
      !mode.demonstrationFinished &&
      !["ready", "save-pending"].includes(mode.phase) &&
      performance.now() < deadline
    ) {
      await wait(80);
      globalThis.recordingDemoProgress = {
        id,
        phase: mode.phase,
        seconds: Math.round(r.capture.elapsed),
        audioEnd: Math.round(r.capture.lastAudioEnd),
        visibleGuidance: visible,
      };
      if (!mode.demonstrating) continue;
      visible.nextNote ||= t.cues.pool.some((pair) => pair.reference.visible);
      visible.activeNote ||=
        t.cues.pool.some((pair) => pair.hand.visible) ||
        [...(ensemble.hands?.labels.values() || [])].some(
          (node) => node.visible && node.userData.activeNote,
        );
      visible.sustain ||= t.cues.pool.some((pair) => pair.yellow.visible);
      visible.bend ||= t.cues.gauge.root.visible;
      check(
        r.capture.presentation.bindings.every((binding) =>
          ["instruments", "labels", "wires"].includes(binding.layer),
        ),
        "Visible guidance leaked into the recorded presentation",
      );
      check(
        !t.adapter.virtuals.some((v) => v.visible && v.children.some((node) => node.visible)),
        "Virtual controller helper rendered",
      );
    }
    check(mode.demonstrationFinished, `Demonstration did not finish: ${mode.feedback}`);
    check(mode.phase === "performing" && r.capture.active, "Score end stopped the recording");
    check(!mode.demonstration.active, "Finished demonstration input remains active");
    const elapsed = r.capture.elapsed,
      attacksAtEnd = attacks.length;
    await wait(2000);
    check(mode.phase === "performing" && r.capture.active, "Recording stopped during the tail");
    check(r.capture.elapsed > elapsed + 1, "Capture did not advance after the music ended");
    check(attacks.length === attacksAtEnd, "Melody retriggered after the demonstration");
    check(
      mode.model().actions.some((action) => action.id === "jog-record-stop" && !action.disabled),
      "Stop Recording is unavailable after the demonstration",
    );
    await t.action("jog-record-stop");
    check(
      visible.nextNote && visible.activeNote,
      `Next/current note cues were never visible: ${JSON.stringify(visible)}`,
    );
    if (events.some((event) => event.beats > 0.5))
      check(visible.sustain, "Sustain guidance was never visible");
    if (events.some((event) => event.bend?.length))
      check(visible.bend, "Bend guidance was never visible");
    check(mode.phase === "ready", `Demonstration did not save: ${mode.feedback}`);
    check(
      r.capture.saved?.complete,
      `Take has capture gaps: ${JSON.stringify({ reason: r.capture.saved?.reason, gaps: r.capture.saved?.gaps, performance: r.capture.saved?.performance, phase: mode.phase, feedback: mode.feedback })}`,
    );
    check(
      r.capture.saved.performance.completionAction === "stopped",
      `Take did not save from manual Stop: ${JSON.stringify(r.capture.saved.performance)}`,
    );
    check(
      JSON.stringify(attacks) === JSON.stringify(events.map((event) => event.role)),
      `Melody attacks differ: ${JSON.stringify({ actual: attacks, expected: events.map((event) => event.role), metrics: r.capture.metrics })}`,
    );
    check(
      backingTakes.every(
        ([h, timeline, json, routes]) =>
          h.timeline === timeline &&
          JSON.stringify(h.timeline.toJSON()) === json &&
          JSON.stringify(h.tracks.map((track) => track.connectedHonkId)) === JSON.stringify(routes),
      ),
      "Demonstration changed backing takes or routes",
    );
    const takeId = r.capture.saved.id;
    check(!t.adapter.virtuals.some((v) => v.visible), "Virtual playback remains active after save");
    await mode.action("exit");
    check(
      r.sessionMode === "play" &&
        JSON.stringify(r.sceneSerializer.serialize().instruments) === before,
      "Play workspace did not return",
    );
    return {
      id,
      takeId,
      melodyAttacks: attacks.length,
      visibleGuidance: visible,
      backingMembers: frame?.poses.length || 0,
      complete: true,
      manualStop: true,
      headsetTested: false,
    };
  } finally {
    for (const [h, original] of originals) h.startAudioVoice = original;
    r.capture.startReady = start;
    r.capture.includeUI = false;
    r.capture.syntheticXR = null;
  }
}
