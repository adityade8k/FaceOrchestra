/** Bounded diagnostics. Durations use wall-clock milliseconds; no audio clock
 * or musical beat positions are stored here. Disabled unless explicitly begun. */
export class FrameMetrics {
  constructor(capacity = 600) {
    this.capacity = Math.max(1, Math.min(36000, Math.floor(capacity) || 600));
    this.samples = new Array(this.capacity);
    this.cursor = 0;
    this.count = 0;
    this.pending = {};
  }
  record(phase, milliseconds) {
    this.pending[phase] = (this.pending[phase] || 0) + milliseconds;
  }
  finish(now, runtime, renderer) {
    const audio = runtime.audioSystem?.honkVoices;
    const capture = runtime.capture;
    this.samples[this.cursor] = {
      now,
      phases: this.pending,
      instruments: runtime.instrumentRegistry.size,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      activeVoices: audio?.voices?.size || 0,
      releasingVoices: [...(audio?.releasingVoices?.values() || [])].reduce(
        (n, voices) => n + voices.size,
        0,
      ),
      captureInflightBytes: capture?.inflightBytes || 0,
      captureQueueDepth: capture?.inflight || 0,
    };
    this.pending = {};
    this.cursor = (this.cursor + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }
  snapshot() {
    const samples = [];
    for (let i = 0; i < this.count; i++)
      samples.push(this.samples[(this.cursor - this.count + i + this.capacity) % this.capacity]);
    return structuredClone({ capacity: this.capacity, samples });
  }
}
