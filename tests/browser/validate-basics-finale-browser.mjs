// Exercise the real recorder, sound, collision and scoring paths. The test
// drives controller poses; it never installs a timeline or supplies note evidence.
export async function validate(app, { prepared = false, onProgress = () => {} } = {}) {
  const { BASICS_STEPS } = await import("../../src/tutorial/basicsSteps.js");
  const { CompositionConductor } = await import("../../src/tutorial/CompositionConductor.js");
  const r = app.runtime,
    t = r.tutorial,
    a = t.adapter;
  const checks = [];
  const check = (ok, message) => {
    if (!ok) throw new Error(message);
    checks.push(message);
  };
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (predicate, message, timeout = 25000) => {
    const deadline = performance.now() + timeout;
    while (!predicate()) {
      if (performance.now() > deadline)
        throw new Error(message + ": " + (t.uiFeedback || t.session?.feedback || t.basics?.error));
      await delay(20);
    }
  };
  const stamp = () =>
    JSON.stringify(
      ["chordLooper", "percussionLooper"].map((role) => a.get(role)?.timeline.toJSON()),
    );
  let tick, removeDriver, driver;
  if (!prepared) {
    app.stopCompute();
    tick = setInterval(() => app.update(0.016, 0, performance.now()), 16);
    await t.action("basics");
    const index = BASICS_STEPS.findIndex((step) => step.id === "finale");
    // Standalone fixture skips earlier Basics only; finale completion is earned below.
    for (const step of BASICS_STEPS.slice(0, index)) t.basics.completed.add(step.id);
    await t.basics.enter(index);
  }
  try {
    const b = t.basics;
    check(b.step.id === "finale" && b.finale && !b.error, "Basics enters the composition finale");
    check(r.instrumentRegistry.getByKind("looper").length === 2, "Exactly two backing loopers");
    check(
      ["chordLooper", "percussionLooper"].every((role) => !a.get(role).timeline.hasRecording()),
      "Both recordings start empty",
    );
    check(!t.flow.unavailable(), "Prepared ensemble is playable");
    await t.action("next-step");
    check(t.session.index === 0, "Cannot skip the first recording");
    await t.action("step-demo");
    await until(() => !t.demo, "Chord demonstration finishes");
    check(t.session.demonstrated.has("record-chords"), "Chord demonstration completed");
    check(!a.get("chordLooper").timeline.hasRecording(), "Demonstration restores the empty take");
    check(!t.session.outcomes.has("record-chords"), "Demonstration earns no learner completion");

    const results = [];
    for (const id of ["record-chords", "record-percussion", "learn-bend", "performance"]) {
      onProgress(id);
      check(t.session.step.id === id, "Finale part: " + id);
      const before = stamp();
      if (id !== "record-chords") {
        await t.action("step-demo");
        await until(
          () => Boolean(t.demo?.session.anchorMs !== null && t.demo) || id === "learn-bend",
          "Demonstration starts",
        );
        await delay(id === "learn-bend" ? 600 : 1000);
        await t.action("step-demo");
        check(stamp() === before, id + " demo preserves both user takes");
      }
      a.setVirtualsActive(true, "learner");
      await t.action("step-practice");
      check(t.session.phase === "practicing", id + " practice starts");
      // The existing pose driver uses normal Trigger/Grip and collision input.
      // Practice already owns arming and the count-in, so do not arm a second time.
      driver = new CompositionConductor(a, t.session, { origin: "learner", demonstration: true });
      driver.update(performance.now());
      driver.actions.add("arm");
      let bendSeen = false,
        backingSeen = false,
        downbeatAligned = false;
      removeDriver = app.frameScheduler.add(
        "INPUT",
        ({ now }) => {
          if (t.session?.phase === "practicing") driver.update(now);
          bendSeen ||= Boolean(t.cues.bendInstruction);
          backingSeen ||= a.snapshot(now).aligned;
          const roles =
            id === "record-percussion" ? ["chordLooper"] : ["chordLooper", "percussionLooper"];
          downbeatAligned ||=
            t.session.anchorBeat !== null &&
            roles.every(
              (role) =>
                a.get(role)?.looperData.clockPlaybackStartBeatPosition === t.session.anchorBeat,
            );
        },
        { order: -1, label: "finale test controller poses" },
      );
      await until(
        () => t.session.phase === "results",
        id + " assessment",
        id === "performance" ? 85000 : 25000,
      );
      removeDriver();
      removeDriver = null;
      driver.stop();
      driver = null;
      a.setVirtualsActive(false);
      check(t.session.result.ok, id + ": " + t.session.result.message);
      check(
        t.session.evidence.every((event) => event.origin === "learner"),
        id + " uses learner evidence only",
      );
      if (id === "record-chords" || id === "record-percussion")
        check(a.get(t.session.step.looperRole).timeline.hasRecording(), id + " stores a real take");
      if (id === "record-percussion")
        check(
          JSON.stringify(a.get("chordLooper").timeline.toJSON()) ===
            JSON.stringify(JSON.parse(before)[0]),
          "Recording percussion retains the chord take",
        );
      if (id === "learn-bend" || id === "performance") {
        check(bendSeen, id + " shows the radial bend guide");
        check(stamp() === before, id + " keeps both recordings intact");
      }
      if (id === "performance")
        check(backingSeen, "Both user loops play together under the full melody");
      if (id === "performance" || id === "record-percussion")
        check(downbeatAligned, id + " backing starts on the learner's downbeat after the count-in");
      if (id === "record-chords") {
        const take = stamp(),
          session = t.session;
        t.onXREnd();
        await delay(50);
        check(
          t.basics === b && t.session === session,
          "Leaving XR keeps the finale session available",
        );
        check(stamp() === take, "XR interruption retains the user's chord take");
      }
      results.push({ id, score: t.session.result.score });
      await t.action("next-step");
    }
    check(
      b.step.id === "finish" && b.completed.has("finale"),
      "Successful composition reaches the Basics finish screen",
    );
    check(!t.session && !t.demo, "Finale session and demonstrations clean up");
    check(
      ["chordLooper", "percussionLooper"].every((role) => a.get(role).timeline.hasRecording()),
      "Completed composition keeps both takes in the tutorial scene",
    );
    return { checks, results, headsetTested: false };
  } finally {
    removeDriver?.();
    driver?.stop();
    a.setVirtualsActive(false);
    if (!prepared) {
      clearInterval(tick);
      await t.navigation.enterPlay();
    }
  }
}
