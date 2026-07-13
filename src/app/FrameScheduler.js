export const FRAME_PHASES = Object.freeze([
  "INPUT",
  "INTENT",
  "TRANSFORM",
  "COLLISION",
  "RELATIONSHIPS",
  "AUTOMATION",
  "PERFORMANCE",
  "PRESENTATION",
  "MAINTENANCE",
]);

export class FrameScheduler {
  constructor(phases = FRAME_PHASES) {
    this.phases = [...phases];
    this.callbacks = new Map(this.phases.map((phase) => [phase, []]));
  }

  add(phase, callback, { order = 0, label = callback?.name || "anonymous" } = {}) {
    const phaseCallbacks = this.callbacks.get(phase);
    if (!phaseCallbacks) {
      throw new Error(`Unknown frame phase: ${phase}`);
    }
    if (typeof callback !== "function") {
      throw new TypeError(`Frame callback for ${phase} must be a function`);
    }

    const entry = { callback, order, label };
    phaseCallbacks.push(entry);
    phaseCallbacks.sort((first, second) => first.order - second.order);
    return () => {
      const index = phaseCallbacks.indexOf(entry);
      if (index >= 0) {
        phaseCallbacks.splice(index, 1);
      }
    };
  }

  run(frame = {}) {
    const context = {
      delta: Number.isFinite(frame.delta) ? frame.delta : 0,
      elapsed: Number.isFinite(frame.elapsed) ? frame.elapsed : 0,
      now: Number.isFinite(frame.now) ? frame.now : performance.now(),
      skipRemaining: false,
      skipToPhase: null,
      ...frame,
    };

    for (const phase of this.phases) {
      if (context.skipRemaining) {
        break;
      }
      if (context.skipToPhase && phase !== context.skipToPhase) {
        continue;
      }
      context.skipToPhase = null;
      context.phase = phase;
      for (const entry of this.callbacks.get(phase)) {
        entry.callback(context);
        if (context.skipRemaining || context.skipToPhase) {
          break;
        }
      }
    }
    return context;
  }

  describe() {
    return this.phases.map((phase) => ({
      phase,
      callbacks: this.callbacks.get(phase).map(({ label }) => label),
    }));
  }
}
