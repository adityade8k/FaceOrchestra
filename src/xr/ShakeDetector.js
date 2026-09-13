// World-space meters and milliseconds. Keep one sample before the window edge,
// so duration recognition works at any frame rate, including irregular frames.
export class ShakeDetector {
  constructor(settings) { this.settings = settings; this.samples = []; }
  reset() { this.samples.length = 0; }
  sample(position, now) {
    const s = this.settings, samples = this.samples, last = samples.at(-1);
    const p = { x: position.x, y: position.y, z: position.z };
    if (last) {
      const dt = now - last.time, distance = dist(last.position, p);
      if (dt <= 0 || dt > s.maxFrameGapMs || distance > s.maxStepMeters || distance / dt * 1000 > s.maxSpeed) this.reset();
    }
    samples.push({time:now, position:p});
    while (samples.length > 2 && samples[1].time <= now - s.durationMs) samples.shift();
    while (samples.length > 128) samples.shift();
    if (samples.length < 3 || now - samples[0].time < s.durationMs) return false;
    const ranges = ['x','y','z'].map(axis => ({axis, range:Math.max(...samples.map(v=>v.position[axis]))-Math.min(...samples.map(v=>v.position[axis]))}));
    const dominant = ranges.sort((a,b)=>b.range-a.range)[0];
    if (dominant.range < s.range) return false;
    let travel = 0, reversals = 0, direction = 0, extreme = samples[0].position[dominant.axis];
    for (let i=1;i<samples.length;i++) {
      travel += dist(samples[i-1].position, samples[i].position);
      const value = samples[i].position[dominant.axis], delta = value - extreme;
      if (!direction) {
        if (Math.abs(delta) >= s.reversalTravel) { direction = Math.sign(delta); extreme = value; }
      } else if (Math.sign(delta) === direction) extreme = value;
      else if (Math.abs(delta) >= s.reversalTravel) { reversals++; direction *= -1; extreme = value; }
    }
    return reversals >= s.minReversals && travel >= s.minTravel && travel / (now-samples[0].time)*1000 >= s.intensity;
  }
}
function dist(a,b) { return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z); }
