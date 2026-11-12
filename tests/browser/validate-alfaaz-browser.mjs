import { validate as validateSong } from "./validate-song-browser.mjs";

export async function validate(app, { tutorial: runTutorial = true } = {}) {
  const r = app.runtime,
    t = r.tutorial,
    checks = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const beforeFrame = t.beforeFrame.bind(t);
  let nextFrame = 0,
    slowFrames = 0;
  // Emulate delayed XR visual frames without delaying Web Audio or music ticks.
  t.beforeFrame = (now) => {
    if (now < nextFrame) return;
    nextFrame = now + (++slowFrames % 40 === 0 ? 400 : 100);
    beforeFrame(now);
  };
  let tutorial;
  try {
    if (runTutorial)
      tutorial = await validateSong(app, { id: "alfaaz", full: true, recording: false });
  } finally {
    t.beforeFrame = beforeFrame;
  }
  if (runTutorial)
    check(
      tutorial.checks.includes("Authored melody attack order and count"),
      "All authored melody attacks survive delayed render frames",
    );
  if (runTutorial)
    check(
      tutorial.checks.includes("Backing attack count: 225/225"),
      "All 225 backing strokes survive delayed render frames",
    );
  const before = r.sceneSerializer.serialize();
  await t.navigation.selectComposition("alfaaz", "record-songs");
  const mode = t.recording.session;
  mode.trackingReady = () => true;
  const startReady = r.capture.startReady.bind(r.capture);
  r.capture.startReady = (options) => startReady({ ...options, synthetic: true });
  const calls = [],
    starts = [];
  const percussion = r.playStickPercussion.bind(r);
  try {
    await r.capture.pair("123456");
    await mode.action("prepare");
    check(mode.phase === "ready", "Recording prepares");
    const frame = mode.ensemble.layoutFrame;
    check(
      frame?.enabled && t.layoutFrames().includes(frame),
      "Record Songs exposes the active melody placement frame",
    );
    const member = frame.members[0],
      position = member.root.position.clone();
    const move = frame.root.position.clone().add({ x: 0.12, y: -0.04, z: 0.1 });
    check(frame.apply(move, 1.1), "Record Songs melody frame moves and resizes");
    check(
      member.root.position.distanceTo(position) > 0.05,
      "Recording horns follow the placement frame",
    );
    frame.reset();
    check(
      member.root.position.distanceTo(position) < 1e-8,
      "Recording frame reset restores the compact defaults",
    );
    const selected = mode.composition,
      roles = new Set(selected.score.events.map((e) => e.role));
    for (const role of roles) {
      const h = t.adapter.get(role),
        start = h.startAudioVoice.bind(h);
      h.startAudioVoice = (voice, options = {}) => {
        calls.push({
          kind: "melody",
          role,
          at: performance.now(),
          beat: mode.melodyGuide?.beatAt(performance.now()),
          voice,
          notes: { ...mode.ensemble.hands.notes },
        });
        return start(voice, options);
      };
      starts.push([h, start]);
    }
    r.playStickPercussion = (sound, options = {}) => {
      calls.push({ kind: "drum", sound, volume: options.volume, time: options.scheduledTime });
      return percussion(sound, options);
    };
    const preparation = [];
    const changed = () => {
      if (r.capture.state === "preparing") preparation.push(r.capture.message);
    };
    r.capture.addEventListener("change", changed);
    const began = performance.now();
    await mode.action("demonstrate");
    const preparationMs = performance.now() - began;
    r.capture.removeEventListener("change", changed);
    check(mode.phase === "count-in", `Recording demonstration counts in (${mode.feedback})`);
    check(!frame.enabled, "Placement locks during recording");
    check(
      preparation.some((m) => /Preparing recording: \d+%/.test(m)),
      "Recording preparation displays progress",
    );
    const deadline = performance.now() + 85000;
    while (
      !mode.demonstrationFinished &&
      ["count-in", "performing", "saving"].includes(mode.phase) &&
      performance.now() < deadline
    )
      await wait(100);
    check(mode.demonstrationFinished && r.capture.active, "Recording continues after the score");
    await mode.action("stop");
    const saved = r.capture.saved;
    check(mode.phase === "ready", `Recorded demonstration returns to ready (${mode.feedback})`);
    check(
      saved?.performance.playback === "demonstration" &&
        saved.performance.completionAction === "stopped",
      `Full demonstration saves after manual Stop (${saved?.performance.interruption || mode.feedback})`,
    );
    check(saved.complete && !saved.gaps.length, "Full demonstration has no capture gaps");
    check(
      Number.isFinite(saved.performance.performanceStart),
      "Take reached the performance after count-in",
    );
    check(frame.enabled, "Placement is available again after the take");
    check(
      mode.ensemble.loopers.every(
        (h) => !h.transport.playing && !h.looperData.pendingLaunch && !h.looperData.queued,
      ),
      "Completed take cancels every Looper launch",
    );
    const melody = calls.filter((c) => c.kind === "melody"),
      drums = calls.filter((c) => c.kind === "drum");
    const expectedRoles = selected.score.events.map((e) => e.role);
    const matchingMelody =
      JSON.stringify(melody.map((c) => c.role)) === JSON.stringify(expectedRoles);
    if (!matchingMelody)
      throw new Error(
        `Recorded melody attacks differ: ${JSON.stringify({ expectedRoles, melody })}`,
      );
    check(
      matchingMelody,
      `Recorded demonstration plays all ${expectedRoles.length} melody attacks in order`,
    );
    check(
      drums.length === 225,
      `Recorded demonstration plays all percussion strokes (${drums.length})`,
    );
    for (const sound of ["boink", "metronomeWood"]) {
      const expected = selected.arrangement.backing.filter((e) => e.sound === sound),
        heard = drums.filter((e) => e.sound === sound).sort((a, b) => a.time - b.time);
      check(expected.length === heard.length, `${sound} stroke count`);
      check(
        expected.every((e, i) => Math.abs(e.gain * 0.515 - heard[i].volume) < 1e-8),
        `${sound} soft accents retained`,
      );
    }
    const report = {
      tutorial,
      checks,
      preparationMs,
      slowFrames,
      take: saved.id,
      duration: saved.duration,
      captureMetrics: saved.metrics,
      performanceStart: saved.performance.performanceStart,
    };
    for (const [h, start] of starts) h.startAudioVoice = start;
    r.playStickPercussion = percussion;
    // Exercise a subsequent live take and immediate Stop after the demonstration.
    await mode.action("start");
    check(
      mode.phase === "count-in",
      `Live recording can start after the demonstration (${mode.phase}: ${mode.feedback})`,
    );
    await mode.action("stop");
    check(mode.phase === "ready" && frame.enabled, "Stop during count-in restores placement");
    await mode.action("exit");
    check(
      JSON.stringify(r.sceneSerializer.serialize()) === JSON.stringify(before),
      "Record Songs restores the original free-play scene",
    );
    return report;
  } finally {
    r.capture.startReady = startReady;
    r.playStickPercussion = percussion;
    for (const [h, start] of starts) h.startAudioVoice = start;
    if (!mode.disposed) await mode.action("exit");
  }
}
