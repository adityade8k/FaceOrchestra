export async function validate() {
  const { r, t, d, check, wait } = window.__rishte;
  const cues = t.cues, hands = d.ensemble.hands;
  const update = cues.update, trigger = hands.trigger, render = r.renderer.render;
  const screenshots = {}, failures = [], runs = [];
  let run = null, frame = null;
  const verify = (condition, message) => {
    if (!condition && failures.length < 10) failures.push(message);
  };
  const ids = (color) => cues.pool.filter(p => p[color].visible).map(p => p[color].userData.eventId).sort();
  const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected.sort());
  hands.trigger = function(hand, role, active, now) {
    const controller = this.a.virtuals[hand === "R" ? 0 : 1];
    if (run && active && !r.controllerStates.get(controller)?.trigger) {
      const beat = d.ensemble.beatAt(now);
      const event = d.guide.step.events.find(e => e.role === role && beat >= e.beat && beat < e.beat + e.beats);
      if (event) run.triggers.set(event.id, now);
    }
    return trigger.call(this, hand, role, active, now);
  };
  cues.update = function(session, now, options) {
    update.call(this, session, now, options);
    if (!run || !session || session.step.cueStyle !== "attack-next") return;
    const beat = session.beatAt(now), events = session.step.events;
    const active = events.filter(e => beat >= e.beat && beat < e.beat + e.beats);
    const nextBeat = events.find(e => e.beat > beat)?.beat;
    const next = events.filter(e => e.beat === nextBeat);
    const prepareStart = event => {
      const previous = events.findLast(e => e.role === event.role && e.beat < event.beat);
      return Math.max(event.beat - 1, previous ? previous.beat + previous.beats : -Infinity);
    };
    const preparing = next.filter(e => beat >= prepareStart(e));
    const circles = [...active, ...preparing.filter(e => !active.some(a => a.role === e.role))];
    verify(same(ids("yellow"), circles.map(e => e.id)), `Yellow targets at ${beat}`);
    verify(same(ids("reference"), next.map(e => e.id)), `Next white circle at ${beat}`);
    verify(same(ids("red"), active.map(e => e.id)), `Current red square at ${beat}`);
    verify(ids("green").length === 0, "Rishte must have no green timing ring");
    for (const event of circles) {
      const pair = cues.pool.find(p => p.yellow.visible && p.yellow.userData.eventId === event.id);
      if (!pair) continue;
      const expected = beat < event.beat ? .08 + 1.27 * (event.beat - beat) / (event.beat - prepareStart(event)) :
        .08 + .92 * (beat - event.beat) / event.beats;
      verify(Math.abs(pair.yellow.scale.x / (t.adapter.get(event.role).getSqueezeColliderSphere().radius * 1.12) - expected) < 1e-9, `Hold growth ${event.id}`);
      if (beat >= event.beat && !run.yellow.has(event.id)) {
        run.yellow.set(event.id, now);
        run.maximumOnsetDelayMs = Math.max(run.maximumOnsetDelayMs, (beat - event.beat) * session.beatMs);
      }
    }
    run.frames++;
    run.maximumOverlap = Math.max(run.maximumOverlap, active.length);
    frame = { active, next, preparing, beat };
  };
  r.renderer.render = function(...args) {
    const result = render.apply(this, args);
    if (run?.mode === "preview" && frame && args[0] === r.scene) {
      const fraction = frame.active[0] && (frame.beat - frame.active[0].beat) / frame.active[0].beats;
      const name = !frame.active.length && frame.preparing.length ? "prepare" :
        !frame.active.length && frame.next.length ? "next" :
        frame.active.length > 1 ? "overlap" : fraction < .1 ? "attack" :
        frame.active[0]?.id === "t0-e51" && fraction > .4 && fraction < .6 ? "hold" : null;
      if (name && !screenshots[name]) screenshots[name] = this.domElement.toDataURL("image/png");
    }
    return result;
  };
  const start = mode => {
    run = { mode, frames: 0, yellow: new Map(), triggers: new Map(), maximumOnsetDelayMs: 0, maximumOverlap: 0 };
  };
  const finish = () => {
    const result = { mode: run.mode, frames: run.frames, yellowAttacks: run.yellow.size,
      controllerAttacks: run.triggers.size, maximumOnsetDelayMs: run.maximumOnsetDelayMs, maximumOverlap: run.maximumOverlap };
    if (run.mode === "preview") {
      check(run.yellow.size === 175 && run.triggers.size === 175, "Missing preview attack cues");
      const errors = [...run.triggers].map(([id, at]) => Math.abs(run.yellow.get(id) - at));
      result.maximumCueToControllerFrameDifferenceMs = Math.max(...errors);
      check(result.maximumCueToControllerFrameDifferenceMs === 0, "Yellow and controller attacks use different frames");
    } else check(run.triggers.size === 0, "Practice triggered melody automatically");
    check(run.maximumOnsetDelayMs < 100, "Late visual onset");
    check(failures.length === 0, failures.join("; "));
    runs.push(result); run = null; frame = null;
  };
  try {
    start("preview"); await t.action("rishte-preview");
    const limit = performance.now() + 115000;
    while (d.phase && performance.now() < limit) await wait(40);
    check(d.feedback.startsWith("Full preview complete"), "Preview interrupted: " + d.feedback);
    finish();
    check(cues.pool.every(p => Object.values(p).every(m => !m.visible)), "Ending left a cue");
    start("practice"); await t.action("step-practice");
    const practiceLimit = performance.now() + 25000;
    let changed = false;
    while (d.phase && performance.now() < practiceLimit) {
      if (!changed && run.yellow.size >= 3) { d.ensemble.metro.setBpm(50); changed = true; }
      await wait(40);
    }
    check(!d.phase && d.feedback.includes("matched"), "Practice did not reach its ending");
    check(run.yellow.size === d.step.eventIds.length, "Practice missed a cue");
    finish();
    await t.action("step-practice"); await wait(400); await t.action("rishte-stop");
    check(cues.pool.every(p => Object.values(p).every(m => !m.visible)), "Stop left a cue");
    for (const name of ["next", "prepare", "attack", "hold", "overlap"]) check(screenshots[name], "Missing screenshot " + name);
    return { bpm: d.definition.bpm, runs, tempoChange: "75 → 50 BPM during practice",
      noGreen: true, nextWhiteCircleThroughoutRests: true, currentRedSquare: true, yellowShrinksToAttack: true,
      yellowGrowsToCurrentSquare: true, cleanStopAndEnding: true, screenshots };
  } finally {
    cues.update = update; hands.trigger = trigger; r.renderer.render = render;
    await t.action("rishte-stop");
  }
}
