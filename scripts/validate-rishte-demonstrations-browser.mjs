export async function validate() {
  const { r, t, d, check, wait } = window.__rishte;
  const a = t.adapter, metro = a.get("metronome"), f = d.ensemble.layoutFrame;
  const outcomes = JSON.stringify(d.outcomes); let takes;
  const placed = f.root.position.clone(), scale = f.scale, steps = [], originals = [];
  let calls = [], recoveries = [];
  const controller = d.ensemble.loopers[0].looperController, reconcile = controller.reconcileScheduledAudioAtSource;
  controller.reconcileScheduledAudioAtSource = function(h, source, audioNow) {
    recoveries.push({ role: a.roleForId(h.id), atMs: performance.now(), source, audioNow });
    return reconcile.call(this, h, source, audioNow);
  };
  originals.push(() => { controller.reconcileScheduledAudioAtSource = reconcile; });
  for (const recipe of d.definition.arrangement.recipes.filter(p => p.kind === "honk")) {
    const h = a.get(recipe.role), start = h.startAudioVoice;
    originals.push(() => { h.startAudioVoice = start; });
    h.startAudioVoice = function(id, options = {}) {
      calls.push({ role: recipe.role, midi: recipe.midi, voiceId: id, atMs: performance.now(), scheduledTime: options.scheduledTime });
      return start.call(this, id, options);
    };
  }
  const clean = () => {
    check(!d.phase && f.enabled && f.root.visible, "Demonstration did not return to placement");
    check(f.scale === scale && f.root.position.distanceTo(placed) < 1e-8, "Demonstration lost placement");
    check(t.cues.pool.every(p => Object.values(p).every(m => !m.visible)), "Demonstration left timing cues");
    check(r.instrumentRegistry.getByKind("honk").every(h => !h.activeVoiceIds.size && !h.hornHolders.size), "Demonstration left notes active");
    check(JSON.stringify(d.outcomes) === outcomes, "Demonstration changed practice credit");
    check(JSON.stringify(d.ensemble.loopers.map(h => h.looperController.serializeState(h))) === takes, "Demonstration changed saved takes");
  };
  try {
    let panelImage;
    for (const [index, lesson] of d.definition.lessons.entries()) {
      d.index = index; d.cancel(); metro.setBpm(d.definition.bpm); t.render(performance.now());
      const button = t.panel.buttonNodes.get("step-demo");
      check(button && !button.disabled, "Missing Demonstrate button on " + lesson.title);
      check(t.panel.buttons.some(b => b.visible && b.userData.action === "step-demo"), "Missing XR Demonstrate on " + lesson.title);
      if (!index) {
        check(t.panel.buttons.some(b => b.visible && b.userData.action === "rishte-preview"), "Full preview unavailable on opening step");
        check(t.panel.layout.every(region => region.bottom <= region.limit), "XR panel text overlaps controls");
        panelImage = t.panel.canvas.toDataURL("image/png");
      }
      calls = []; recoveries = []; button.click();
      const startLimit = performance.now() + 2000;
      while (!d.phase && performance.now() < startLimit) await wait(20);
      check(d.phase === "demo", "Demonstrate did not start " + lesson.title + ": " + d.feedback);
      takes = JSON.stringify(d.ensemble.loopers.map(h => h.looperController.serializeState(h)));
      check(!f.enabled && !f.root.visible && f.controls.hidden, "Demonstration allowed frame movement");
      check(d.guide.startBeat === lesson.startBeat && d.guide.endBeat === lesson.endBeat, "Wrong demonstration range");
      check(JSON.stringify(d.guide.step.events.map(e => e.id)) === JSON.stringify(lesson.eventIds), "Wrong demonstration notes");
      const expectedBpm = lesson.completePerformance ? d.definition.bpm : lesson.recommendedBpm;
      check(metro.bpm === expectedBpm, "Demonstration differs from practice tempo");
      check(d.ensemble.origin === "demonstration", "Wrong playback origin");
      steps.push({ title: lesson.title, events: lesson.eventIds.length, bpm: metro.bpm, startBeat: d.guide.startBeat, endBeat: d.guide.endBeat });
      if (index > 0 && !lesson.completePerformance) {
        await t.action("rishte-stop"); continue;
      }
      // Play the first phrase and the entire final arrangement in real time.
      const anchor = d.ensemble.anchor, audioAnchor = { ...d.ensemble.audioAnchor };
      let maximumHands = 0;
      const deadline = performance.now() + (lesson.endBeat - lesson.startBeat + 6) * 60000 / metro.bpm + 3000;
      while (d.phase && performance.now() < deadline) {
        maximumHands = Math.max(maximumHands, r.controllers.filter(c => c.userData.virtualTutorial && r.controllerStates.get(c)?.trigger).length);
        await wait(40);
      }
      check(!d.phase && d.feedback.includes("complete"), "Demonstration interrupted: " + d.feedback);
      await wait(500); clean();
      const melody = calls.filter(c => c.role.startsWith("lead-")), backing = calls.filter(c => c.role.startsWith("backing-"));
      const expected = d.definition.score.events.filter(e => lesson.eventIds.includes(e.id));
      check(JSON.stringify(melody.map(c => c.midi)) === JSON.stringify(expected.map(e => e.midi)), "Demonstrated melody pitches or count differ");
      steps.at(-1).playedToEnd = true;
      steps.at(-1).melodyAttacks = melody.length;
      if (lesson.completePerformance) {
        window.__rishte.demoCalls = calls;
        check(melody.length === 175 && backing.length === 121, "Final arrangement counts " + JSON.stringify({melody:melody.length,backing:backing.length,recoveries,backingCalls:backing}));
        const transitions=d.ensemble.blocks.slice(0,-1).reduce((count,b,i)=>count+b.patterns.filter((role,lane)=>role&&d.ensemble.blocks[i+1].patterns[lane]&&role!==d.ensemble.blocks[i+1].patterns[lane]).length,0);
        check(maximumHands === 2 && d.ensemble.handoffs.length === transitions, "Missing overlapping holds or backing transitions");
        const beatMs = 60000 / expectedBpm, audioZero = audioAnchor.audioSeconds + (anchor - audioAnchor.wallMs) / 1000;
        let backingError = 0;
        for (const role of new Set(d.definition.arrangement.backing.map(e => e.role))) {
          const source = d.definition.arrangement.backing.filter(e => e.role === role);
          const actual = backing.filter(e => e.role === role).sort((x, y) => x.scheduledTime - y.scheduledTime);
          check(source.length === actual.length, "Final backing note count " + role);
          for (const [i, e] of source.entries()) backingError = Math.max(backingError, Math.abs(actual[i].scheduledTime - audioZero - e.beat * beatMs / 1000) * 1000);
        }
        const melodyError = Math.max(...melody.map((e, i) => Math.abs(e.atMs - anchor - expected[i].beat * beatMs)));
        check(backingError < 2, "Scheduled backing timing differs from score: " + backingError);
        Object.assign(steps.at(-1), { backingAttacks: backing.length, maximumHands, backingTransitions: d.ensemble.handoffs.length,
          backingOnsetErrorMs: backingError, melodyOnsetErrorMs: melodyError,
          melodyRenderingLatencyOver100Ms: melodyError > 100 });
        steps.at(-1).timingRecoveries = recoveries;
      }
    }
    clean();
    d.index = 0; d.cancel(); t.render(performance.now());
    return { steps, sameTempoAsPractice: true, noDemonstrationCredit: true, takesRestored: true,
      cleanEndings: true, layoutPreserved: true, testedLayoutScale: scale,
      fullArrangementRendering: window.__rishte.timingOnly ? "matrix updates only during playback; placement controls use native WebGL" : "native WebGL", panelImage };
  } finally {
    originals.forEach(restore => restore());
    await t.action("rishte-stop");
  }
}
