// One selection and one pending handoff per (Metronome, output). The audio
// scheduler and frame transport both service this state; frames never own timing.
const EPSILON = 1e-9;
const nextBeat = beat => Math.floor(beat + EPSILON) + 1;
export const looperEligible = looper => Boolean(looper && !looper.disposed &&
  looper.root?.visible !== false && looper.looperData?.timeline?.hasRecording() &&
  !looper.looperData.recording && !looper.looperData.recordArmed);

export class LooperPortTransport {
  constructor() { this.groups = new Map(); this.sequence = 0; }
  key(timing) { return JSON.stringify([timing.metronomeId, timing.portId]); }
  group(timing) {
    const key = this.key(timing);
    if (!this.groups.has(key)) this.groups.set(key, {key, active:null, pending:null, updating:false});
    return this.groups.get(key);
  }
  request(looper, controller, timing, now, options = {}) {
    if (!looperEligible(looper) || !timing.active) return false;
    const group = this.group(timing);
    this.update(group, now);
    if (group.active?.looper === looper) {
      this.cancelPending(group, now);
      if (group.active) {
        // A fresh Play keeps the active cycle, including when Pause was armed.
        if (looper.looperData.pauseArmed) controller.clearArmedState(looper.looperData);
        controller.adapter.updateVisuals?.(looper);
        return true;
      }
    }
    if (group.pending?.looper === looper) return true;
    // An armed launch reserves the port immediately. Until it sounds an explicit
    // selection can replace it on the same beat, without launching both takes.
    let targetBeat = options.targetBeat ?? nextBeat(timing.beatPosition);
    let audioAnchor = options.audioAnchor;
    if (group.active && !group.active.looper.looperData.playing && !group.completed) {
      targetBeat = group.active.looper.looperData.pendingLaunch?.targetBeat ?? targetBeat;
      audioAnchor = group.active.looper.looperData.pendingLaunch?.audioAnchor ?? audioAnchor;
      const previous = group.active;
      this.remove(previous.looper, now);
      previous.controller.stopPlayback(previous.looper);
      group.active = null;
    }
    this.cancelPending(group, now);
    const entry = {looper, controller};
    looper.looperData.portGroup = group;
    if (!group.active) {
      group.active = entry;
      return controller.armPlaybackSelected(looper, now, timing, {...options, targetBeat, audioAnchor});
    }
    const outgoing = group.active, data = outgoing.looper.looperData;
    const source = outgoing.controller.getAbsoluteSourcePosition(outgoing.looper, now);
    const duration = data.timeline.durationMs;
    // The complete recorded cycle includes final rests and the explicit Gap.
    const limit = (Math.floor((source + 1e-7) / duration) + 1) * duration;
    const interval = outgoing.controller.getSourceBeatInterval(data.timeline);
    group.boundary = interval > 0
      ? {beat:data.audioScheduling.originBeat + (limit - data.audioScheduling.startSourceMs) / interval}
      : {wallMs:data.audioScheduling.startWallMs + limit - data.audioScheduling.startSourceMs};
    group.limit = limit;
    group.completed = false;
    group.pending = entry;
    data.playbackLimitSourceMs = limit;
    looper.looperData.queued = true;
    targetBeat = this.targetBeat(group, timing, now);
    group.request = {id:++this.sequence, fromId:outgoing.looper.id, toId:looper.id,
      requestedAtMs:now, requestedBeat:timing.beatPosition, boundarySourceMs:limit,
      origin:options.origin || "learner", requestedPhase:((source % duration) + duration) % duration / duration,
      fromRevision:data.takeRevision, toRevision:looper.looperData.takeRevision};
    outgoing.controller.trimPlaybackAtBoundary(outgoing.looper, limit, now);
    controller.armPlaybackSelected(looper, now, timing, {...options, resume:false, targetBeat,
      audioAnchor:data.audioScheduling.audioAnchor || audioAnchor});
    outgoing.controller.adapter.updateVisuals?.(outgoing.looper);
    return true;
  }
  targetBeat(group, timing, now) {
    const beat = group.boundary.beat ?? timing.beatPosition + (group.boundary.wallMs - now) / timing.beatIntervalMs;
    return Math.ceil(beat - EPSILON);
  }
  cancelPending(group, now) {
    const pending = group.pending;
    if (!pending) return;
    group.pending = null;
    pending.looper.looperData.portGroup = null;
    pending.looper.looperData.queued = false;
    pending.controller.stopPlayback(pending.looper, {preservePortGroup:true});
    const outgoing = group.active;
    if (outgoing) {
      const data = outgoing.looper.looperData;
      data.playbackLimitSourceMs = null;
      data.audioScheduling.scheduledThroughSourceMs = Math.min(data.audioScheduling.scheduledThroughSourceMs, group.limit - 1e-6);
      outgoing.controller.adapter.updateVisuals?.(outgoing.looper);
      if (group.completed) { data.portGroup = null; group.active = null; }
    }
    group.boundary = group.request = null;
    group.completed = false;
  }
  remove(looper, now = performance.now()) {
    const group = looper?.looperData?.portGroup;
    if (!group) return;
    if (group.pending?.looper === looper) this.cancelPending(group, now);
    if (group.active?.looper === looper) {
      this.cancelPending(group, now);
      group.active = null;
    }
    looper.looperData.portGroup = null;
    looper.looperData.queued = false;
    looper.looperData.playbackLimitSourceMs = null;
  }
  update(group, now) {
    if (!group || group.updating || !group.active) return;
    group.updating = true;
    try {
      const {looper, controller} = group.active;
      const timing = controller.getTimingForLooper(looper, now);
      if (!timing.active || !timing.connected || this.key(timing) !== group.key || !looperEligible(looper)) {
        this.remove(looper, now); controller.stopPlayback(looper); return;
      }
      const incoming = group.pending;
      if (!incoming) return;
      const incomingTiming = incoming.controller.getTimingForLooper(incoming.looper, now);
      if (!looperEligible(incoming.looper) || !incomingTiming.connected || this.key(incomingTiming) !== group.key) {
        this.cancelPending(group, now); return;
      }
      const targetBeat = this.targetBeat(group, timing, now);
      incoming.controller.retimePendingLaunch(incoming.looper, incomingTiming, now, targetBeat);
      const complete = group.boundary.beat !== undefined
        ? timing.beatPosition + EPSILON >= group.boundary.beat : now + 1e-6 >= group.boundary.wallMs;
      if (complete && !group.completed) {
        group.completed = true;
        controller.stopPlayback(looper, {preservePortGroup:true});
      }
      if (!complete || timing.beatPosition + EPSILON < targetBeat) return;
      const request = {...group.request, beat:targetBeat, completedAtMs:now};
      looper.looperData.portGroup = null;
      group.active = incoming; group.pending = null; group.completed = false;
      group.boundary = group.request = null;
      incoming.looper.looperData.queued = false;
      incoming.looper.looperData.pendingLaunch.switch = request;
      incoming.controller.launchArmedStart(incoming.looper, incomingTiming, now);
    } finally { group.updating = false; }
  }
  reset() {
    for (const group of this.groups.values()) {
      if (group.active) { const entry=group.active; this.remove(entry.looper); entry.controller.stopPlayback(entry.looper); }
    }
    this.groups.clear();
  }
}
