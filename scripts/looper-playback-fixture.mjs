// Deterministic adapter fixture shared by behavioral tests and the opt-in benchmark.
export function createPlaybackFixture(Controller, Graph, {
  seconds = 10, tracks = 8, componentSize = 1, snapshotMs = 1000 / 90,
  noteEndMs = 300, percussion = false, trace = false, separateSources = false,
} = {}) {
  const graph = new Graph();
  const calls = [];
  const counts = { start: 0, update: 0, release: 0, cancel: 0, drum: 0, graph: 0, entries: 0, ranges: 0 };
  let audioNow = 10;
  const record = (kind, ...args) => { counts[kind] += 1; if (trace) calls.push([kind, ...args]); };
  const controller = new Controller({
    ensureAudio() {}, getAudioCurrentTime: () => audioNow,
    getTimingForLooper: () => ({ connected: false }),
    isPlayableHonkId: (id) => graph.hasHonk(id),
    getPlaybackTargetsRevision: () => graph.revision,
    getPlaybackTargetIds: (_track, id) => { counts.graph += 1; return graph.getConnectedComponent(id); },
    startActionVoice: (voice, id, options) => record('start', voice, id, options),
    updateActionVoiceByHonkId: (voice, id, snapshot, volume, options) => record('update', voice, id, { ...snapshot }, volume, options),
    releaseActionVoice: (voice, id, options) => record('release', voice, id, options),
    cancelActionVoice: (voice, id, options) => record('cancel', voice, id, options),
    playStickPercussion: (type, { scheduledTime }) => record('drum', type, scheduledTime),
    setAutomationLayerByHonkId() {}, clearAutomationLayerByHonkId() {}, updateVisuals() {},
  });
  const looper = { id: 'bench', root: { visible: true }, hitTargets: {} };
  const data = looper.looperData = controller.createStateData(looper, { trackCount: tracks });
  for (let i = 0; i < tracks; i += 1) {
    const source = `source-${separateSources ? i : 0}`;
    graph.addHonk(source);
    data.tracks[i].connectedHonkId = source;
    for (let j = 1; j < componentSize; j += 1) graph.setContact(source, `${source}-member-${j}`, true);
    const add = (type, timeMs, extra) => data.timeline.addActionEvent(`track-${i}`, { trackIndex: i, type, timeMs, ...extra });
    for (let time = 0; time < seconds * 1000; time += 500) {
      add('squeezeStart', time, { value: 1, gateOnly: true });
      add('squeezeEnd', time + noteEndMs, { value: 0, gateOnly: true });
    }
    for (let n = 0; n * snapshotMs < seconds * 1000; n += 1) {
      const time = n * snapshotMs;
      add('gestureSnapshot', time, {
        values: { squeeze: time % 500 < noteEndMs ? 1 : 0, bend: Math.sin(time / 300) * 0.25, vowel: 'A' },
        interpolation: 'linear',
      });
    }
  }
  if (percussion) data.timeline.addDrumHitEvent('self', { timeMs: 150, drumType: 'hihat' });
  data.timeline.finalizeDuration();
  data.timeline.durationMs = seconds * 1000;
  data.timeline.recordedDurationMs = seconds * 1000;
  data.hasRecording = true;
  const scheduleEvent = controller.applier.scheduleTrackEvent.bind(controller.applier);
  controller.applier.scheduleTrackEvent = (...args) => { counts.entries += 1; return scheduleEvent(...args); };
  const scheduleRange = controller.scheduleSourceRange.bind(controller);
  controller.scheduleSourceRange = (...args) => { counts.ranges += 1; return scheduleRange(...args); };
  return {
    controller, graph, looper, counts, calls,
    setTime(ms) { audioNow = 10 + ms / 1000; },
    resetCounts() { for (const key of Object.keys(counts)) counts[key] = 0; calls.length = 0; },
    start() { audioNow=9.8; controller.startPlayback(looper, -200); audioNow=10; controller.updateClockedTransports([looper], 0); controller.schedulePlaybackAudioForLooper(looper, 0); controller.stopAudioScheduler(looper, { release: false }); },
    join(count = 8, sourceIndex = null) {
      for (let i = 0; i < count; i += 1) {
        for (let track = 0; track < tracks; track += 1) {
          if (sourceIndex === null || track === sourceIndex) graph.setContact(`source-${separateSources ? track : 0}`, `joined-${i}`, true);
        }
      }
    },
    split(count = 8) {
      for (let i = 0; i < count; i += 1) for (let track = 0; track < tracks; track += 1) {
        graph.setContact(`source-${separateSources ? track : 0}`, `joined-${i}`, false);
      }
    },
  };
}
