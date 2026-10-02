// Opt-in instrumentation of the real animation loop. Synthetic learner input
// drives normal controller/audio/recording paths; this is not a headset test.
export async function profile(app, { frames = 360, scenarios = null } = {}) {
  const r = app.runtime,
    t = r.tutorial,
    a = t.adapter;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const stats = (values) => {
    const sorted = values.toSorted((a, b) => a - b);
    return {
      samples: values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      p99: sorted[Math.floor(sorted.length * 0.99)] || 0,
      max: sorted.at(-1) || 0,
      total: values.reduce((a, b) => a + b, 0),
    };
  };
  let current = null,
    driver = null;
  const restore = [],
    results = {};
  const wrap = (object, key, name) => {
    const original = object[key];
    object[key] = function (...args) {
      const start = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        if (current)
          (current.costs[name] ||= []).push(performance.now() - start);
      }
    };
    restore.push(() => (object[key] = original));
  };
  wrap(app.frameScheduler, "run", "frameCPU");
  wrap(app.sceneRuntime, "render", "renderCPU");
  wrap(t, "afterFrame", "tutorialAfterFrame");
  wrap(t, "render", "panelModel");
  wrap(t.cues, "update", "timingCues");
  wrap(a, "observe", "observation");
  wrap(a.labelPresentation, "instrumentBounds", "labelBounds");
  wrap(t.panel, "render", "panelRender");
  wrap(r, "updateRaycastHover", "hover");
  wrap(r, "updateHorn", "honkPerformance");
  for (const [phase, entries] of app.frameScheduler.callbacks)
    for (const entry of entries) wrap(entry, "callback", `phase:${phase}`);
  const observer = new MutationObserver((records) => {
    if (current)
      for (const record of records) {
        current.domMutations++;
        if (record.target.closest?.(".kuch-keyboard"))
          current.keyboardMutations++;
      }
  });
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    childList: true,
    characterData: true,
  });
  const longTasks = [];
  const longObserver = new PerformanceObserver((list) => {
    if (current) longTasks.push(...list.getEntries().map((e) => e.duration));
  });
  longObserver.observe({ type: "longtask" });
  try {
    await t.enterPlay();
    await r.audioSystem.ensureAudio();
    await t.selectComposition("kuch-to-hua-hai", "tutorials", "easier-bends");
    const k = t.kuch;
    if (!k) throw new Error(t.uiFeedback || "Kuch not ready");
    const update = k.update;
    k.update = function (now) {
      if (driver && k.phase?.learner) {
        const beat = (now - k.anchor) / k.timing.beatMs;
        const event = k.phase.events.find(
          (e) =>
            beat >= e.beat &&
            beat < e.beat + e.beats - (k.phase.kind === "chords" ? 0.05 : 0),
        );
        k.playNote(event, now);
      }
      return update.call(this, now);
    };
    restore.push(() => (k.update = update));
    for (const scenario of [
      { name: "idle-desktop", kind: null, xrUI: false, menu: true },
      { name: "melody-desktop", kind: "melody", xrUI: false, menu: true },
      { name: "melody-xr-panel", kind: "melody", xrUI: true, menu: true },
      { name: "melody-menu-hidden", kind: "melody", xrUI: true, menu: false },
      {
        name: "full-song-backing-xr-panel",
        kind: "performance",
        xrUI: true,
        menu: true,
      },
      {
        name: "full-song-backing-hidden",
        kind: "performance",
        xrUI: true,
        menu: false,
      },
      { name: "chord-recording", kind: "chords", xrUI: true, menu: true },
    ].filter((s) => !scenarios || scenarios.includes(s.name))) {
      current = null;
      driver = null;
      k.cancel();
      t.panel.setXR(scenario.xrUI);
      t.panel.recenter(r.getUserCamera(), true);
      t.menu.setVisible(scenario.menu);
      k.index = scenario.kind
        ? k.steps.findIndex((s) => s.kind === scenario.kind)
        : 0;
      if (scenario.kind) {
        if (scenario.kind === "performance") k.prepareBacking();
        k.start(k.step, true);
        a.setVirtualsActive(true, "learner");
        driver = true;
        while (performance.now() < k.anchor + 100) await wait(20);
      } else await wait(500);
      const textureBefore = t.panel.texture.version,
        statusBefore = t.panel.statusTexture.version;
      longTasks.length = 0;
      current = {
        costs: {},
        intervals: [],
        drawCalls: [],
        triangles: [],
        voices: [],
        domMutations: 0,
        keyboardMutations: 0,
      };
      let previous = null;
      for (let i = 0; i < frames; i++)
        await new Promise((resolve) =>
          requestAnimationFrame((now) => {
            if (previous !== null) current.intervals.push(now - previous);
            previous = now;
            current.drawCalls.push(r.renderer.info.render.calls);
            current.triangles.push(r.renderer.info.render.triangles);
            current.voices.push(r.audioSystem.honkVoices.voices.size);
            resolve();
          }),
        );
      const raw = current;
      current = null;
      if (scenario.kind && !k.phase)
        throw new Error(
          `Practice interrupted during ${scenario.name}: ${k.feedback}`,
        );
      results[scenario.name] = {
        ...scenario,
        instruments: r.instrumentRegistry.size,
        frames,
        frameIntervalMs: stats(raw.intervals),
        over25ms: raw.intervals.filter((v) => v > 25).length,
        over50ms: raw.intervals.filter((v) => v > 50).length,
        costsMs: Object.fromEntries(
          Object.entries(raw.costs).map(([name, values]) => [
            name,
            stats(values),
          ]),
        ),
        drawCalls: stats(raw.drawCalls),
        triangles: stats(raw.triangles),
        voices: stats(raw.voices),
        domMutations: raw.domMutations,
        keyboardMutations: raw.keyboardMutations,
        panelTextureUpdates: t.panel.texture.version - textureBefore,
        statusTextureUpdates: t.panel.statusTexture.version - statusBefore,
        longTasksMs: [...longTasks],
      };
    }
    return {
      framesPerScenario: frames,
      viewport: [innerWidth, innerHeight],
      syntheticLearner: true,
      headset: false,
      capture: false,
      results,
    };
  } finally {
    current = null;
    driver = null;
    observer.disconnect();
    longObserver.disconnect();
    for (const undo of restore.reverse()) undo();
    t.panel.setXR(false);
    t.menu.setVisible(true);
    await t.enterPlay();
  }
}
