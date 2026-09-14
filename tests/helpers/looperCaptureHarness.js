import { LooperController } from "../../src/instruments/looper/LooperController.js";
const BEAT_INTERVAL_MS = 500;
export function createHarness({ connected, trackCount = 8 }) {
  const inputs = Array.from({ length: trackCount }, () => ({
    squeeze: 0,
    bend: 0,
    musicalOnset: false,
  }));
  const clock = {
    active: connected,
    connected,
    metronomeId: connected ? "metro-a" : null,
    beatIntervalMs: connected ? BEAT_INTERVAL_MS : 0,
    beatOriginMs: connected ? 0 : null,
    beatPosition: connected ? 0 : null,
  };
  const calls = [];
  const adapter = {
    isPlayableHonkId: () => true,
    getPlaybackTargetIds: (_track, id) => [id],
    startActionVoice: (id, honk, options) => calls.push({kind:"start", id, ...options}),
    updateActionVoiceByHonkId: (id, honk, snapshot, volume, options) => calls.push({kind:"expression", id, snapshot:{...snapshot}, ...options}),
    releaseActionVoice: (id, honk, options) => calls.push({kind:"release", id, ...options}),
    playStickPercussion: (type, options) => calls.push({kind:"drum", type, ...options}),
    cancelLooperPercussion: () => calls.push({kind:"cancelDrums"}),
    getTimingForLooper: (_id, now) => ({ ...clock, beatPosition:(now - clock.beatOriginMs) / clock.beatIntervalMs }),
    captureActionByHonkId: (honkId) => ({ ...inputs[Number(honkId.split("-").at(-1))] }),
    updateVisuals() {},
    ensureAudio() {},
  };
  const controller = new LooperController(adapter);
  const looper = { id: "looper-a", root: { visible: true }, hitTargets: {} };
  looper.looperData = controller.createStateData(looper, { trackCount });
  for (let index = 0; index < trackCount; index += 1) {
    looper.looperData.tracks[index].connectedHonkId = `honk-${index}`;
  }
  return {
    controller,
    looper,
    calls,
    inputs,
    clock,
    get timeline() {
      return looper.looperData.timeline;
    },
  };
}

export function setHonk(harness, trackIndex, now, squeeze) {
  harness.inputs[trackIndex].squeeze = squeeze;
  harness.inputs[trackIndex].musicalOnset = squeeze > 0.025;
  if (harness.clock.connected) harness.clock.beatPosition = now / BEAT_INTERVAL_MS;
  harness.controller.updateRecordings([harness.looper], now);
}
