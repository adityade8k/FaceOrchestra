// Synthetic controllers use the ordinary Trigger, voice and observer paths.
export async function validate(host, { songId = "tu-kisi-rail-si", prepared = false,
  onProgress = () => {}, onSustain = () => {} } = {}) {
  const r = host.r, a = host.adapter;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const until = async (condition, message, timeout = 10000) => {
    const deadline = performance.now() + timeout;
    while (!condition()) { check(performance.now() < deadline, message); await wait(16); }
  };
  if (!prepared) {
    await host.action("play"); await host.action("tutorials"); await host.action("composition:" + songId);
  }
  const d = host.dataTutorial;
  check(d?.ensemble.prepared, "Song was not prepared");
  await host.action("rishte-stop");
  const roles = new Set(d.definition.score.events.map(e => e.role));
  const honks = [...roles].map(role => a.get(role));
  check(honks.length === new Set(d.definition.score.events.map(e => e.midi)).size, "Duplicate melody Honks");
  check(new Set(honks.map(h => a.midi(h))).size === honks.length, "Repeated pitch targets remain");
  const target = honks[0], locked = target.locked, maps = [];
  for (const state of [false, true]) {
    target.locked = state; r.updateLockVisual(target); r.updateNoteLabel(target);
    target.root.traverse(o => {
      for (const m of [].concat(o.material || [])) if (m.userData.lockTextureUniqueMaterial)
        maps.push(m.map === (state ? r.instrumentMaterialTextures.lockedBaseMap : r.instrumentMaterialTextures.baseMap));
    });
  }
  target.locked = locked; r.updateLockVisual(target);
  check(maps.length && maps.every(Boolean), "Locked texture was lost");
  await wait(1000);
  await host.action("step-practice");
  check(!d.practiceGate && !d.guide.practiceGate, "Song still waits on a completed-note gate");
  const markers = () => {
    const beat = d.ensemble.beatAt(d.last), events = d.guide.step.events;
    const current = events.filter(e => beat >= e.beat && beat < e.beat + e.beats);
    const next = events.find(e => e.beat > beat);
    for (const [role, square] of a.handIndicators.labels) {
      check(square.userData.activeNote === current.some(e => e.role === role), "Square is not following song time");
      check(square.material.map === null, "Square still has a letter texture");
    }
    const previews = host.cues.pool.filter(p => p.reference.visible);
    check(previews.length === (next ? 1 : 0), "Wrong number of next-note circles");
    if (next) check(previews[0].reference.userData.eventId === next.id &&
      previews[0].reference.material.color.getHex() === 0x9c9c9c && !previews[0].hand.visible,
      "Next note needs a gray circle without an extra highlight");
    check(honks.every(h => h.root.visible), "A melody Honk disappeared");
  };
  const third = d.guide.step.events[2];
  await until(() => d.guide.beatAt(performance.now()) >= third.beat + .05, "Silent practice stopped advancing", 20000);
  check(d.phase === "practice", "Practice stopped unexpectedly: " + d.feedback);
  markers();
  check(honks.every(h => !h.activeVoiceIds.size), "Practice automated the melody");
  onProgress("Missed notes do not delay the beat or the current/next indicators.");
  await host.action("step-practice");
  a.setVirtualsActive(true, "learner");
  const controller = a.virtuals[1];
  const release = () => a.input(controller, "trigger", false);
  const aim = role => {
    const h = a.get(role);
    h.root.getWorldQuaternion(controller.quaternion);
    controller.position.copy(h.getSqueezeColliderSphere().center);
    controller.translateZ(.38); controller.updateMatrixWorld(true);
  };
  try {
    const event = d.guide.step.events.find(e => e.beats >= .75);
    const played = a.get(event.role);
    played.locked = true; r.updateLockVisual(played);
    aim(event.role);
    await until(() => d.guide.beatAt(performance.now()) >= event.beat, "Timed note never arrived", 20000);
    check(honks.every(h => !h.activeVoiceIds.size), "Aiming without Trigger sounded a note");
    a.input(controller, "trigger", true);
    await until(() => a.gestures.get(controller)?.voiced, "Trigger did not sound the note");
    const gesture = a.gestures.get(controller);
    const beatAtAttack = d.guide.beatAt(performance.now());
    const sustainMs = event.beats * d.guide.beatMs;
    let samples = 0, previous = -1, lastPair;
    await until(() => {
      markers();
      check(a.gestures.get(controller) === gesture && played.activeVoiceIds.size > 0,
        "Sustain guidance cut off the player's held note");
      const pair = host.cues.pool.find(p => p.white.visible && p.white.userData.eventId === event.id);
      if (pair) {
        check(pair.yellow.visible && pair.white.material.color.getHex() === 0xffffff, "Missing sustain feedback");
        check(pair.yellow.position.distanceTo(pair.white.position) < 1e-8, "Sustain circles have different centers");
        const fraction = pair.yellow.scale.x / pair.white.scale.x;
        check(fraction >= previous && fraction <= 1, "Sustain progress moved backward");
        previous = fraction; samples++; lastPair = pair;
        onSustain({ pair, fraction, complete: false });
      }
      return performance.now() - gesture.voicedStartMs >= sustainMs + 300;
    }, "Song clock did not advance beyond the sustain", sustainMs + 3000);
    check(samples > 2, "No intermediate sustain animation");
    check(played.activeVoiceIds.size > 0 && played.hornHolders.size > 0, "A full sustain indicator stopped the voice");
    check(d.guide.beatAt(performance.now()) > beatAtAttack, "A held Trigger froze song time");
    onSustain({ pair: lastPair, fraction: 1, complete: true });
    markers(); release();
    await until(() => !played.activeVoiceIds.size, "Trigger release did not stop the note");
    a.input(controller, "trigger", true);
    await until(() => played.activeVoiceIds.size > 0, "A sustain lock prevented replaying the same Honk");
    release();
    await until(() => !played.activeVoiceIds.size, "Replay did not stop on release");
    onProgress("Sustain indicators guide without stopping or locking notes; Trigger remains in control.");
    await host.action("rishte-stop");
    await host.action("step-practice");
    check(d.guide.beatAt(performance.now()) < d.step.startBeat, "Retry did not restart its count-in");
    return { songId: d.definition.id, beatBasedCues: true, missedNotesDoNotWait: true,
      heldNotesDoNotFreeze: true, triggerRequired: true, sustainFeedback: true, sustainedPastIndicator: true,
      playerControlsRelease: true, sameHonkReplay: true,
      grayNextCircle: true, squareHighlights: true, allMelodyHonksVisible: honks.length,
      lockedTextureAndHue: true, freshRetryCountIn: true, synthesizedLearnerEvents: false };
  } finally { release(); a.park(controller); a.setVirtualsActive(false); }
}
