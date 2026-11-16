// Run on the same device and viewport before/after a performance change.
// CPU submission time is not GPU completion time or headset frame time.
export async function benchmark(app, { counts = [8, 32, 64, 128], frames = 90 } = {}) {
  const r = app.runtime;
  app.stopCompute();
  await r.tutorial.navigation.enterPlay();
  r.tutorial.navigation.menu.setVisible(false);
  const results = [];
  let metrics = null;
  const restore = [];
  const summary = (samples) => {
    const sorted = [...samples].sort((a, b) => a - b);
    return {
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
    };
  };
  for (const [phase, entries] of app.frameScheduler.callbacks) {
    for (const entry of entries) {
      const original = entry.callback;
      entry.callback = function (...args) {
        const start = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          if (metrics) (metrics[phase] ||= []).push(performance.now() - start);
        }
      };
      restore.push(() => {
        entry.callback = original;
      });
    }
  }
  try {
    for (const count of counts) {
      r.tutorial.adapter.clear();
      for (let i = 0; i < count; i++) {
        if (!r.createSpawnedComponent("honk")) throw new Error(`Could not spawn Honk ${i}`);
        const h = r.activeInstrumentState;
        h.root.position.set(((i % 8) - 3.5) * 0.24, 0.5 + Math.floor(i / 8) * 0.18, -1.5);
      }
      const honks = r.instrumentRegistry.getByKind("honk");
      r.scene.updateMatrixWorld(true);
      for (const controller of r.controllers) {
        controller.visible = true;
        controller.userData.inputConnected = true;
        controller.matrixAutoUpdate = true;
        controller.position.copy(honks[0].getSqueezeColliderSphere().center);
        controller.position.z += 0.5;
        controller.quaternion.identity();
        controller.updateMatrixWorld(true);
      }
      for (const shadows of [true, false]) {
        app.sceneRuntime.renderer.shadowMap.enabled = shadows;
        // Warm shader compilation and geometry uploads before sampling.
        for (let i = 0; i < 15; i++) {
          app.update(1 / 60, 0, performance.now());
          app.sceneRuntime.render();
          await new Promise(requestAnimationFrame);
        }
        metrics = {};
        const cpu = [],
          render = [],
          intervals = [];
        let previous;
        for (let i = 0; i < frames; i++) {
          await new Promise(requestAnimationFrame);
          const now = performance.now();
          if (previous !== undefined) intervals.push(now - previous);
          previous = now;
          app.update(1 / 60, 0, now);
          const renderStart = performance.now();
          app.sceneRuntime.render();
          render.push(performance.now() - renderStart);
          cpu.push(performance.now() - now);
        }
        const info = app.sceneRuntime.renderer.info;
        results.push({
          count,
          shadows,
          cpuMs: summary(cpu),
          renderSubmissionMs: summary(render),
          frameIntervalMs: summary(intervals),
          phases: Object.fromEntries(
            Object.entries(metrics).map(([key, values]) => [key, summary(values)]),
          ),
          drawCalls: info.render.calls,
          triangles: info.render.triangles,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          programs: info.programs.length,
          contactMeasurements: r.honkContactSystem.measurements,
        });
        metrics = null;
      }
    }
    const gl = app.sceneRuntime.renderer.getContext();
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      three: (await import("three")).REVISION,
      userAgent: navigator.userAgent,
      gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      viewport: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      frames,
      scenario:
        "grid of idle Honks, two controller hover rays, desktop rendering; no audio or capture",
      results,
    };
  } finally {
    for (const undo of restore) undo();
    r.tutorial.adapter.clear();
    app.sceneRuntime.renderer.shadowMap.enabled = true;
    app.computeSuspended = false;
    app.start();
  }
}
