import assert from "node:assert/strict";
import { withBrowser } from "../../scripts/browser-session.mjs";

// Real Web Audio verifies clipping, live vs scheduled strikes, quiet-signal
// transparency and clean silence through the same master bus used by the app.
await withBrowser(async (browser) => {
  const report = await browser.evaluate(`(async () => {
    const { PercussionVoiceService } = await import('/src/audio/percussion/PercussionVoiceService.js');
    const { AudioSystem } = await import('/src/audio/AudioSystem.js');
    const { MasterBus } = await import('/src/audio/MasterBus.js');
    const render = async (types, { live = false, bypass = false, volume = 1, rate = 48000, overdrive = false } = {}) => {
      const offline = new OfflineAudioContext(1, rate * 2, rate), start = .125;
      let now = 0;
      const context = new Proxy(offline, { get(target, key) {
        if (key === 'currentTime') return now;
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }});
      const bus = new MasterBus();
      bus.initialize(context);
      if (bypass) { bus.limiter.disconnect(); bus.limiter.connect(bus.output); }
      const audio = new AudioSystem({audioContextService: { ensureContext: async () => context }, masterBus: bus});
      // Reproduce the regressed routing for comparison: percussion used to
      // enter the Honk's heavy compressor and 6.56x makeup stage.
      const service = overdrive
        ? new PercussionVoiceService({ensureAudio: async () => context, getDestination: () => bus.input})
        : audio.percussionVoices;
      const random = Math.random;
      let seed = 31337;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      try {
        for (const [i, type] of types.entries()) {
          const at = start + i * .0003;
          now = live ? at : 0;
          await service.trigger(type, { volume, ...(live ? {} : {scheduledTime: at}), ownerId: live ? null : 'recorded-loop' });
        }
      } finally { Math.random = random; }
      return (await offline.startRendering()).getChannelData(0);
    };
    const metrics = (data) => {
      let peak = 0, energy = 0, clipped = 0, tail = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        if (!Number.isFinite(v)) throw new Error('Non-finite audio');
        peak = Math.max(peak, Math.abs(v)); energy += v*v;
        if (Math.abs(v) >= 1) clipped++;
        if (i > data.length * .85) tail = Math.max(tail, Math.abs(v));
      }
      return {peak, energy, clipped, tail};
    };
    const result = [];
    for (const rate of [44100, 48000]) {
      for (const types of [['boink'], ['hihat'], ['metronomeWood'], Array(8).fill('hihat'), ['boink','hihat','metronomeWood','boink','hihat','metronomeWood']]) {
        const live = await render(types, {live:true, rate});
        const scheduled = await render(types, {rate});
        let difference = 0, differenceAt = 0, earlyDifference = 0;
        for(let i=0;i<live.length;i++){const d=Math.abs(live[i]-scheduled[i]);if(d>difference){difference=d;differenceAt=i/rate;}if(i/rate<.22)earlyDifference=Math.max(earlyDifference,d);}
        result.push({rate,types,...metrics(live),liveScheduledDifference:difference,differenceAt,earlyDifference});
      }
    }
    const old = metrics(await render(['boink'],{live:true,bypass:true,overdrive:true}));
    // Account for WaveShaper's oversampling latency when comparing quiet tone.
    const quiet = await render(['boink'], {volume:.005});
    const originalQuiet = await render(['boink'], {volume:.005,bypass:true});
    const energyRatio = metrics(quiet).energy / metrics(originalQuiet).energy;
    return {cases:result,unprotectedPeak:old.peak,quietEnergyRatio:energyRatio};
  })()`);
  console.log(JSON.stringify(report, null, 2));
  assert.ok(
    report.unprotectedPeak > report.cases[0].peak * 1.3,
    "Old routing overdrives the same percussion voice",
  );
  assert.ok(
    report.cases[0].peak < 0.7,
    "A single bass hit retains headroom without flattening at the ceiling",
  );
  for (const entry of report.cases) {
    assert.ok(entry.peak < 0.98, "Output keeps transient headroom");
    assert.equal(entry.clipped, 0, `${entry.types} at ${entry.rate} must not clip`);
    assert.ok(entry.peak > 0.05 && entry.energy > 0.01, "Percussion remains audible");
    assert.ok(entry.tail < 0.0001, "No DC or stuck tail");
    assert.ok(
      entry.liveScheduledDifference < 1e-5,
      "Live and recorded strikes share the same timbre",
    );
  }
  assert.ok(Math.abs(report.quietEnergyRatio - 1) < 0.01, "Quiet sound retains its level");
});
