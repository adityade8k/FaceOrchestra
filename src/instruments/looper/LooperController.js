import { LooperAudioScheduler } from "./LooperAudioScheduler.js";
import { LooperRecordingLifecycle } from "./LooperRecordingLifecycle.js";
import { BEAT_EQUALITY_EPSILON, nextBeatAfter, hasBeatGrid } from "./looperBeatTiming.js";
import { LooperStateCodec } from "./LooperStateCodec.js";
import {
  LOOPER_CONTROL_DEFAULT_VALUES,
  LOOPER_MIN_ACTION_DURATION_MS,
  LOOPER_TRACK_COUNT,
  LOOPER_STANDALONE_BPM,
} from "../../config/looper.js";
import { LooperPortTransport, looperEligible } from "./LooperPortTransport.js";
import { LooperConnectionManager } from "./LooperConnectionManager.js";

import { LooperControlMapping, getRecordLengthDetent } from "./looperControlMapping.js";
import { LooperGestureApplier } from "./LooperGestureApplier.js";

import { getLooperNodeName } from "./looperNames.js";
import { LooperPlaybackEngine } from "./LooperPlaybackEngine.js";
import { LooperTrack } from "./LooperTrack.js";
import { LooperTransport } from "./LooperTransport.js";
import { LooperTimeline } from "./timeline/LooperTimeline.js";

function exposeTransportState(data) {
  Object.defineProperties(data, {
    recording: {
      enumerable: true,
      get: () => data.transport.recording,
    },
    playing: {
      enumerable: true,
      get: () => data.transport.playing,
    },
    paused: {
      enumerable: true,
      get: () => data.transport.paused,
    },
    armed: {
      enumerable: true,
      get: () => data.transport.armed || Boolean(data.armedAction),
    },
    recordArmed: {
      enumerable: true,
      get: () => data.transport.recordArmed,
    },
    playArmed: {
      enumerable: true,
      get: () => data.transport.playArmed || data.armedAction === "play",
    },
    pauseArmed: {
      enumerable: true,
      get: () => data.armedAction === "pause",
    },
  });
  return data;
}

export class LooperController {
  constructor(adapter = {}) {
    this.adapter = adapter;
    this.audioScheduler = new LooperAudioScheduler(this);
    this.recording = new LooperRecordingLifecycle(this);
    this.stateCodec = new LooperStateCodec(this);
    this.portTransport = new LooperPortTransport();
    this.applier = new LooperGestureApplier(adapter);
    this.connections = new LooperConnectionManager({
      applier: this.applier,
      adapter,
    });
  }

  createStateData(looperState, { trackCount = LOOPER_TRACK_COUNT } = {}) {
    const tracks = [];
    for (let index = 0; index < trackCount; index += 1) {
      const nodeId = getLooperNodeName(index);
      tracks.push(
        new LooperTrack({
          index,
          nodeId,
          nodeTarget: looperState.hitTargets?.[nodeId] || null,
        }),
      );
    }

    return exposeTransportState({
      tracks,
      timeline: new LooperTimeline(),
      playbackEngine: new LooperPlaybackEngine(),
      transport: new LooperTransport(),
      hasRecording: false,
      takeRevision: 0,
      activityRevision: 0,
      durationMs: 0,
      buttonMorphReleaseTimes: new Map(),
      playingHeadMorphValue: 0,
      playingHeadMorphTarget: 0,
      playingHeadMorphPhase: 0,
      lastPlayingHeadMorphUpdateMs: 0,
      lastPlaybackUpdateMs: 0,
      audioScheduling: this.audioScheduler.createState(),
      recordingBeatIntervalMs: 0,
      recordBeats: 16,
      recordLengthControlValue: 1,
      latchedRecordBeats: 16,
      recordingWindow: null,
      recordingCompletion: null,
      localClockOriginMs: 0,
      pendingLaunch: null,
      portGroup: null,
      queued: false,
      playbackLimitSourceMs: null,
      switchHistory: [],
      playbackGeneration: 0,
      launchHistory: [],
      armedAction: null,
      armedAfterBeatOrdinal: null,
      armedAtMs: 0,
      clockMetronomeId: null,
      clockPlaybackStartBeatPosition: null,
      playbackReferenceBeatIntervalMs: 0,
      volumeControlValue: LOOPER_CONTROL_DEFAULT_VALUES.volume,
      gapControlValue: LOOPER_CONTROL_DEFAULT_VALUES.gap,
      gapBeats: LooperControlMapping.getGapBeatsFromControl(LOOPER_CONTROL_DEFAULT_VALUES.gap),
      volume: LooperControlMapping.getVolumeFromControl(LOOPER_CONTROL_DEFAULT_VALUES.volume),
      lastPosition: looperState.root?.position?.clone?.() || null,
      lastQuaternion: looperState.root?.quaternion?.clone?.() || null,
    });
  }

  createTimeline() {
    return new LooperTimeline();
  }

  getTrack(looperState, trackIndexOrId) {
    if (typeof trackIndexOrId === "string") {
      return (
        looperState?.looperData?.tracks?.find((track) => track.trackId === trackIndexOrId) || null
      );
    }
    return looperState?.looperData?.tracks?.[trackIndexOrId] || null;
  }

  startPlayback(looperState, now = performance.now(), { resume = false, origin = "learner" } = {}) {
    const data = looperState?.looperData;
    if (!data) return false;
    const timing = this.getTimingForLooper(looperState, now);
    if (!timing.active || !hasBeatGrid(timing)) return false;
    return this.armPlayback(looperState, now, timing, { resume, origin });
  }

  getPortTransport() {
    return this.adapter.getPortTransport?.() || this.portTransport;
  }

  armPlayback(looperState, now, timing, options = {}) {
    if (!looperEligible(looperState) || !timing.active || !hasBeatGrid(timing)) return false;
    if (timing.connected && timing.portId !== undefined && timing.portId !== null) {
      return this.getPortTransport().request(looperState, this, timing, now, options);
    }
    if (timing.connected && looperState.looperData.playing && !looperState.looperData.pauseArmed)
      return true;
    return this.armPlaybackSelected(looperState, now, timing, options);
  }

  // Only the port arbiter may select an externally clocked launch. All public
  // entry points, including tutorial armPlayback/resume, go through it above.
  armPlaybackSelected(
    looperState,
    now,
    timing,
    { targetBeat = nextBeatAfter(timing.beatPosition), resume = false, audioAnchor = null } = {},
  ) {
    const data = looperState.looperData;
    this.adapter.ensureAudio?.();
    // Restart requests leave the old take sounding until the shared boundary.
    if (data.pendingLaunch && this.isArmedBeatDue(data, timing))
      this.launchArmedStart(looperState, timing, now);
    if (data.pendingLaunch?.targetBeat === targetBeat) {
      if (audioAnchor && data.pendingLaunch.audioAnchor !== audioAnchor) {
        const prepared = data.pendingLaunch.prepared;
        data.pendingLaunch.audioAnchor = audioAnchor;
        data.pendingLaunch.prepared = false;
        if (prepared) {
          this.audioScheduler.prepareArmedAudio(looperState, timing, now);
          this.audioScheduler.schedulePlaybackAudioForLooper(looperState, now);
        }
      }
      return true;
    }
    data.armedAction = "play";
    data.armedAtMs = now;
    data.armedAfterBeatOrdinal = targetBeat - 1;
    data.clockMetronomeId = timing.metronomeId;
    data.pendingLaunch = {
      targetBeat,
      requestedAtMs: now,
      prepared: false,
      audioAnchor: audioAnchor || {
        wallMs: now,
        audioSeconds: this.adapter.getAudioCurrentTime?.(),
      },
      resumeSourceMs: resume && data.transport.paused ? data.playbackEngine.elapsedMs : 0,
    };
    if (!data.transport.playing) data.transport.armPlay();
    this.audioScheduler.startAudioScheduler(looperState, now);
    this.adapter.updateVisuals?.(looperState);
    return true;
  }

  static startAll(
    loopers,
    now = performance.now(),
    { metronomeId = null, fallbackController = null } = {},
  ) {
    const groups = new Map();
    for (const looper of new Set(loopers)) {
      const controller = looper?.looperController || fallbackController;
      if (!controller || !looperEligible(looper)) continue;
      const timing = controller.getTimingForLooper(looper, now);
      if (
        !timing.connected ||
        !timing.active ||
        !hasBeatGrid(timing) ||
        (metronomeId !== null && timing.metronomeId !== metronomeId)
      )
        continue;
      const key = JSON.stringify([timing.metronomeId, timing.portId ?? looper.id]);
      const current = groups.get(key);
      const data = looper.looperData;
      const selected =
        data.portGroup?.active?.looper === looper ||
        (!data.portGroup && (data.playing || (data.pendingLaunch && !data.queued)));
      if (
        !current ||
        selected ||
        (!current.selected &&
          (timing.connectionOrder ?? 0) >= (current.timing.connectionOrder ?? 0))
      ) {
        groups.set(key, { looper, controller, timing, selected });
      }
    }
    const eligible = [...groups.values()];
    if (!eligible.length)
      return {
        ok: false,
        message: "No recorded loopers available on this Metronome.",
      };
    const anchors = new Map(),
      starts = [];
    for (const entry of eligible) {
      const { looper, controller, timing } = entry;
      if (!anchors.has(timing.metronomeId)) {
        const nextBeat = nextBeatAfter(timing.beatPosition);
        const reserved = eligible
          .filter(
            (e) =>
              e.timing.metronomeId === timing.metronomeId &&
              !e.looper.looperData.queued &&
              e.looper.looperData.pendingLaunch?.targetBeat >= nextBeat,
          )
          .sort(
            (a, b) =>
              a.looper.looperData.pendingLaunch.targetBeat -
              b.looper.looperData.pendingLaunch.targetBeat,
          )[0]?.looper.looperData.pendingLaunch;
        anchors.set(timing.metronomeId, {
          targetBeat: reserved?.targetBeat ?? nextBeat,
          audioAnchor: reserved?.audioAnchor || {
            wallMs: now,
            audioSeconds: controller.adapter.getAudioCurrentTime?.(),
          },
        });
      }
      // Preserve both active cycles and their explicit pending selections.
      if (!entry.selected)
        controller.armPlayback(looper, now, timing, anchors.get(timing.metronomeId));
      starts.push({
        looperId: looper.id,
        metronomeId: timing.metronomeId,
        portId: timing.portId,
        targetBeat:
          looper.looperData.pendingLaunch?.targetBeat ??
          looper.looperData.clockPlaybackStartBeatPosition,
      });
    }
    return {
      ok: true,
      message: `Playing one selected looper on each of ${eligible.length} output groups`,
      targetBeat: starts[0].targetBeat,
      requestedAtMs: now,
      looperIds: starts.map((s) => s.looperId),
      starts,
    };
  }

  resumePlayback(looperState, now = performance.now()) {
    return this.startPlayback(looperState, now, { resume: true });
  }

  pausePlayback(looperState, now = performance.now()) {
    const data = looperState?.looperData;
    if (data?.portGroup?.active?.looper === looperState)
      this.getPortTransport().cancelPending(data.portGroup, now);
    if (data?.transport.armed || data?.pauseArmed) {
      this.cancelArmedStart(looperState);
      return true;
    }
    if (!data?.transport.playing) {
      return false;
    }

    const timing = this.getTimingForLooper(looperState, now);
    if (timing.connected && hasBeatGrid(timing)) {
      data.armedAction = "pause";
      data.armedAtMs = now;
      data.armedAfterBeatOrdinal = Math.floor(timing.beatPosition + 1e-9);
      data.clockMetronomeId = timing.metronomeId;
      this.adapter.updateVisuals?.(looperState);
      return true;
    }

    return this.pausePlaybackImmediately(looperState);
  }

  pausePlaybackImmediately(looperState) {
    const data = looperState?.looperData;
    if (!data?.transport.playing) return false;

    this.getPortTransport().remove(looperState);
    this.audioScheduler.stopAudioScheduler(looperState);
    data.playbackEngine.pause({
      onReleaseTrack: (trackId) => this.releaseTrackById(looperState, trackId),
    });
    this.applier.clearLooper(looperState);
    data.transport.pause();
    for (const track of data.tracks) {
      track.isPlaying = false;
    }
    this.adapter.updateVisuals?.(looperState);
    return true;
  }

  stopPlayback(looperState, { preservePortGroup = false } = {}) {
    const data = looperState?.looperData;
    if (!data) {
      return;
    }

    if (!preservePortGroup) this.getPortTransport().remove(looperState);
    data.queued = false;
    data.playbackLimitSourceMs = null;
    this.audioScheduler.stopAudioScheduler(looperState);
    data.playbackEngine.stop({
      onReleaseTrack: (trackId) => this.releaseTrackById(looperState, trackId),
    });
    this.applier.clearLooper(looperState);
    if (!data.transport.recording) {
      data.transport.stop();
    }
    data.lastPlaybackUpdateMs = 0;
    data.clockPlaybackStartBeatPosition = null;
    data.playbackReferenceBeatIntervalMs = 0;
    this.clearArmedState(data);
    for (const track of data.tracks) {
      track.isPlaying = false;
    }
    this.adapter.updateVisuals?.(looperState);
  }

  updatePlayback(looperStates, now = performance.now()) {
    for (const looperState of looperStates) {
      this.updatePlaybackForLooper(looperState, now);
    }
  }

  updatePlaybackForLooper(looperState, now = performance.now()) {
    this.getPortTransport().update(looperState?.looperData?.portGroup, now);
    const data = looperState?.looperData;
    if (!data?.transport.playing || !looperState.root?.visible) {
      return;
    }

    if (!data.timeline?.hasRecording()) {
      this.stopPlayback(looperState);
      return;
    }

    const handlers = {
      onTrackSnapshot: (trackTimeline, snapshot) => {
        const track = this.getTrack(looperState, trackTimeline.trackIndex);
        if (track) {
          this.applier.applyTrackSnapshot(looperState, track, snapshot, {
            volume: data.volume,
          });
        }
      },
      onDrumHit:
        typeof this.adapter.getAudioCurrentTime === "function"
          ? null
          : (_trackTimeline, event) => {
              if (typeof this.adapter.getAudioCurrentTime !== "function") {
                this.adapter.playStickPercussion?.(event.value, {
                  volume: data.volume * (event.gain ?? 1),
                  looperState,
                });
              }
            },
      onReleaseTrack: (trackId) => this.releaseTrackById(looperState, trackId),
      onLoopTrackReset: () => {},
      onLoopBoundary: () => this.handleLoopBoundary(looperState),
      maxCatchupMs: typeof this.adapter.getAudioCurrentTime === "function" ? 1000 : Infinity,
    };
    const timing = this.getTimingForLooper(looperState, now);
    if (hasBeatGrid(timing)) {
      if (
        !timing.active ||
        !hasBeatGrid(timing) ||
        !Number.isFinite(data.clockPlaybackStartBeatPosition)
      )
        return;
      const interval = this.audioScheduler.getSourceBeatInterval(data.timeline);
      const totalElapsedMs =
        interval > 0
          ? Math.max(timing.beatPosition - data.clockPlaybackStartBeatPosition, 0) * interval +
            (data.playbackSourceOffsetMs || 0)
          : Math.max(now - data.audioScheduling.startWallMs, 0);
      data.playbackEngine.updateFromClock(totalElapsedMs, data.timeline, handlers);
      this.audioScheduler.reconcilePlaybackAudioTargets(looperState, now);
      return;
    }
    data.playbackEngine.update(now, data.timeline, 1, handlers);
    this.audioScheduler.reconcilePlaybackAudioTargets(looperState, now);
  }

  updateAutomationAudio() {
    if (typeof this.adapter.getAudioCurrentTime !== "function") {
      this.applier.updateAudio();
    }
  }

  getTimingForLooper(looperState, now = performance.now()) {
    const external = this.adapter.getTimingForLooper?.(looperState?.id, now);
    if (external?.connected) return external;
    const beatIntervalMs = 60000 / LOOPER_STANDALONE_BPM;
    const beatOriginMs = looperState?.looperData?.localClockOriginMs ?? 0;
    return {
      active: true,
      connected: false,
      internal: true,
      bpm: LOOPER_STANDALONE_BPM,
      beatIntervalMs,
      beatOriginMs,
      beatPosition: (now - beatOriginMs) / beatIntervalMs,
      metronomeId: null,
    };
  }

  updateClockedTransports(looperStates, now = performance.now()) {
    for (const looper of looperStates) {
      const data = looper?.looperData;
      if (!data || looper.root?.visible === false) continue;
      this.getPortTransport().update(data.portGroup, now);
      const timing = this.getTimingForLooper(looper, now);
      if (data.queued) continue;
      if ((data.playing || data.pendingLaunch) && data.clockMetronomeId !== timing.metronomeId) {
        this.stopPlayback(looper);
        continue;
      }
      if (!timing.active) {
        if (data.playing || data.playArmed) this.stopPlayback(looper);
        continue;
      }
      if (data.armedAction === "pause" && this.isArmedBeatDue(data, timing))
        this.launchArmedStart(looper, timing, now);
      else if (data.pendingLaunch && this.isArmedBeatDue(data, timing)) {
        this.audioScheduler.prepareArmedAudio(looper, timing, now);
        this.launchArmedStart(looper, timing, now);
      }
    }
  }

  isArmedBeatDue(data, timing) {
    return (
      hasBeatGrid(timing) &&
      timing.beatPosition + BEAT_EQUALITY_EPSILON >= (data.armedAfterBeatOrdinal ?? -1) + 1
    );
  }

  launchArmedStart(looper, timing, now) {
    const data = looper.looperData,
      pending = data.pendingLaunch;
    if (data.queued) return;
    if (data.armedAction === "pause") {
      this.clearArmedState(data);
      this.pausePlaybackImmediately(looper);
      return;
    }
    if (!pending) return;
    this.audioScheduler.prepareArmedAudio(looper, timing, now);
    data.transport.play({ restart: true });
    this.applier.clearVisuals(looper);
    data.playbackEngine.start(data.audioScheduling.startWallMs);
    data.clockPlaybackStartBeatPosition = pending.targetBeat;
    data.playbackSourceOffsetMs = pending.resumeSourceMs;
    data.launchHistory.push({
      beat: pending.targetBeat,
      requestedAtMs: pending.requestedAtMs,
      observedAtMs: now,
      audioPreparedAtMs: pending.audioPreparedAtMs,
      audioOriginTime: pending.audioOriginTime,
      lateMs: Math.max(now - data.audioScheduling.startWallMs, 0),
    });
    if (data.launchHistory.length > 32) data.launchHistory.shift();
    if (pending.switch) {
      data.switchHistory.push(pending.switch);
      if (data.switchHistory.length > 32) data.switchHistory.shift();
      this.adapter.onLooperSwitch?.(looper, pending.switch);
    }
    this.clearArmedState(data);
    this.updatePlaybackForLooper(looper, now);
    this.adapter.updateVisuals?.(looper);
  }

  cancelArmedStart(looper) {
    if (!looper?.looperData?.armed) return false;
    this.stopPlayback(looper);
    return true;
  }

  clearArmedState(data) {
    data.armedAction = null;
    data.armedAfterBeatOrdinal = null;
    data.armedAtMs = 0;
    data.pendingLaunch = null;
  }

  handleClockDisconnected(looperState) {
    const data = looperState?.looperData;
    if (!data) return;
    if (data.transport.recording) {
      this.recording.stopRecording(looperState);
    } else if (data.transport.recordArmed) {
      this.cancelArmedStart(looperState);
    }
    this.stopPlayback(looperState);
    data.clockMetronomeId = null;
  }

  handleLoopBoundary(looperState) {
    this.adapter.updateVisuals?.(looperState);
  }

  releaseTrackById(looperState, trackId) {
    const track = looperState?.looperData?.tracks?.find(
      (candidate) => candidate.trackId === trackId,
    );
    if (track) {
      this.applier.clearTrack(looperState, track);
    }
  }

  connectTrackToHonk(looperState, trackIndexOrId, honkId) {
    return this.connections.connect(looperState, trackIndexOrId, honkId);
  }

  disconnectTrack(looperState, trackIndexOrId, now = performance.now()) {
    const track = this.getTrack(looperState, trackIndexOrId);
    if (looperState?.looperData?.transport.recording && track) {
      this.recording.recorder.releaseTrackActions(
        looperState.looperData.timeline,
        track,
        looperState.looperData.timeline.getElapsedMs(now),
      );
    }
    return this.connections.disconnect(looperState, trackIndexOrId);
  }

  disconnectHonk(looperState, honkId, now = performance.now()) {
    const disconnectedTracks = [];
    for (const track of looperState?.looperData?.tracks || []) {
      if (track.connectedHonkId !== honkId) {
        continue;
      }
      const disconnected = this.disconnectTrack(looperState, track.index, now);
      if (disconnected) {
        disconnectedTracks.push(disconnected);
      }
    }
    return disconnectedTracks;
  }

  setControlValue(looperState, control, value) {
    const data = looperState?.looperData;
    if (!data) {
      return null;
    }
    const clamped = Math.min(Math.max(value, -1), 1);
    if (control === "recordLength") {
      const detent = getRecordLengthDetent(clamped, data.recordBeats);
      if (data.recordBeats !== detent.beats) data.activityRevision++;
      data.recordBeats = detent.beats;
      data.recordLengthControlValue = detent.value;
      this.adapter.updateVisuals?.(looperState);
      return detent.value;
    } else if (control === "gap") {
      if (data.gapBeats !== LooperControlMapping.getGapBeatsFromControl(clamped))
        data.activityRevision++;
      data.gapBeats = LooperControlMapping.getGapBeatsFromControl(clamped);
      data.gapControlValue = LooperControlMapping.getGapControlFromBeats(data.gapBeats);
      if (!data.transport.recording && data.timeline?.hasRecording()) {
        data.timeline.setGapBeats(data.gapBeats, LOOPER_MIN_ACTION_DURATION_MS);
        data.durationMs = data.timeline.durationMs;
      }
      return data.gapControlValue;
    } else if (control === "volume") {
      if (data.volumeControlValue !== clamped) data.activityRevision++;
      data.volumeControlValue = clamped;
      data.volume = LooperControlMapping.getVolumeFromControl(clamped);
    } else {
      return null;
    }
    return clamped;
  }

  clearRuntimeState(looperState) {
    const data = looperState?.looperData;
    if (!data) {
      return;
    }

    this.stopPlayback(looperState);
    data.timeline.recording = false;
    data.timeline.recordingClock = null;
    data.recordingWindow = null;
    data.recordingCompletion = null;
    data.transport.reset();
    this.clearArmedState(data);
    data.clockMetronomeId = null;
    data.clockPlaybackStartBeatPosition = null;
    data.playbackReferenceBeatIntervalMs = 0;
    data.buttonMorphReleaseTimes.clear();
    for (const track of data.tracks) {
      track.resetRuntimeState();
    }
  }

  releaseLooper(looperState) {
    const data = looperState?.looperData;
    if (!data) {
      return;
    }

    if (data.transport.recording) {
      this.recording.stopRecording(looperState);
    }
    this.stopPlayback(looperState);
    for (const track of data.tracks) {
      this.connections.disconnect(looperState, track.index);
    }
    data.transport.reset();
  }

  releaseHonk(honkId) {
    this.applier.clearHonk(honkId);
  }

  captureActionByHonkId(honkId) {
    return this.adapter.captureActionByHonkId?.(honkId) || null;
  }
}
