import {
  LOOPER_GESTURE_EVENT_EPSILONS,
  LOOPER_GESTURE_SAMPLE_INTERVAL_MS,
  LOOPER_MAX_RECORDING_DURATION_MS,
  LOOPER_BEAT_DETECTION_SETTINGS,
  LOOPER_CONTROL_DEFAULT_VALUES,
  LOOPER_MIN_ACTION_DURATION_MS,
  LOOPER_TRACK_COUNT,
} from "../../config/looper.js";
import { LooperConnectionManager } from "./LooperConnectionManager.js";
import { LooperBeatDetector } from "./LooperBeatDetector.js";
import { LooperControlMapping } from "./looperControlMapping.js";
import { LooperGestureApplier } from "./LooperGestureApplier.js";
import { LooperGestureRecorder } from "./LooperGestureRecorder.js";
import { getLooperNodeName } from "./looperNames.js";
import { LooperPlaybackEngine } from "./LooperPlaybackEngine.js";
import { LooperTrack } from "./LooperTrack.js";
import { LooperTransport } from "./LooperTransport.js";
import { LooperTimeline } from "./timeline/LooperTimeline.js";

const LOOPER_SELF_PERCUSSION_TRACK_ID = "looper-self-percussion";

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
      get: () => data.transport.armed || data.armedAction === "pause",
    },
    recordArmed: {
      enumerable: true,
      get: () => data.transport.recordArmed,
    },
    playArmed: {
      enumerable: true,
      get: () => data.transport.playArmed,
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
    this.recorder = new LooperGestureRecorder({
      sampleIntervalMs: LOOPER_GESTURE_SAMPLE_INTERVAL_MS,
      epsilons: LOOPER_GESTURE_EVENT_EPSILONS,
    });
    this.beatDetector = new LooperBeatDetector(LOOPER_BEAT_DETECTION_SETTINGS);
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
      durationMs: 0,
      buttonMorphReleaseTimes: new Map(),
      playingHeadMorphValue: 0,
      playingHeadMorphTarget: 0,
      playingHeadMorphPhase: 0,
      lastPlayingHeadMorphUpdateMs: 0,
      lastPlaybackUpdateMs: 0,
      recordingBeatIntervalMs: 0,
      armedAction: null,
      armedAfterBeatOrdinal: null,
      armedAtMs: 0,
      clockMetronomeId: null,
      clockPlaybackStartBeatPosition: null,
      volumeControlValue: LOOPER_CONTROL_DEFAULT_VALUES.volume,
      gapControlValue: LOOPER_CONTROL_DEFAULT_VALUES.gap,
      gapBeats: LooperControlMapping.getGapBeatsFromControl(
        LOOPER_CONTROL_DEFAULT_VALUES.gap,
      ),
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
      return looperState?.looperData?.tracks?.find(
        (track) => track.trackId === trackIndexOrId,
      ) || null;
    }
    return looperState?.looperData?.tracks?.[trackIndexOrId] || null;
  }

  startRecording(looperState, now = performance.now()) {
    const data = looperState?.looperData;
    if (!data) {
      return false;
    }

    const timing = this.getTimingForLooper(looperState, now);
    if (timing.connected) return this.armRecording(looperState, now, timing);
    return this.beginRecording(looperState, now, null);
  }

  armRecording(looperState, now, timing) {
    const data = looperState.looperData;
    this.stopPlayback(looperState);
    data.armedAction = "record";
    data.armedAtMs = now;
    data.armedAfterBeatOrdinal = null;
    data.clockMetronomeId = timing.metronomeId;
    data.transport.armRecord();
    this.adapter.updateVisuals?.(looperState);
    return true;
  }

  beginRecording(looperState, now, timing = null) {
    const data = looperState.looperData;

    this.stopPlayback(looperState);
    data.timeline = new LooperTimeline();
    data.hasRecording = false;
    data.durationMs = 0;
    data.transport.record();

    for (const track of data.tracks) {
      track.resetRuntimeState();
    }

    data.recordingBeatIntervalMs = hasBeatGrid(timing) ? timing.beatIntervalMs : 0;
    this.recorder.start(
      data.timeline,
      data.tracks,
      now,
      (honkId) => this.captureActionByHonkId(honkId),
      timing,
    );
    this.adapter.updateVisuals?.(looperState);
    return true;
  }

  stopRecording(looperState, now = performance.now()) {
    const data = looperState?.looperData;
    if (data?.transport.recordArmed) {
      this.cancelArmedStart(looperState);
      return false;
    }
    if (!data?.transport.recording) {
      return false;
    }

    data.hasRecording = this.recorder.stop(
      data.timeline,
      data.tracks,
      now,
      LOOPER_MIN_ACTION_DURATION_MS,
      (honkId) => this.captureActionByHonkId(honkId),
      null,
    );
    if (data.timeline.timingMode !== "metronome") {
      const beatAnalysis = this.beatDetector.analyze(data.timeline, {
        fallbackBeatIntervalMs: data.recordingBeatIntervalMs,
      });
      if (beatAnalysis) {
        this.beatDetector.apply(data.timeline, beatAnalysis);
      } else {
        // Preserve the ordinary, non-beat fallback: trim the pre-performance
        // rest only when no reliable grid was inferred.
        data.timeline.normalizeToFirstAction();
        data.timeline.finalizeDuration(LOOPER_MIN_ACTION_DURATION_MS);
      }
    }
    data.timeline.setGapBeats(data.gapBeats, LOOPER_MIN_ACTION_DURATION_MS);
    data.recordingBeatIntervalMs = 0;
    data.durationMs = data.timeline.durationMs;
    data.transport.finishRecording();
    this.adapter.updateVisuals?.(looperState);
    return data.hasRecording;
  }

  clearRecording(looperState) {
    const data = looperState?.looperData;
    if (!data) {
      return;
    }

    this.stopPlayback(looperState);
    data.timeline.clearRecording();
    data.hasRecording = false;
    data.durationMs = 0;
    data.transport.reset();
    for (const track of data.tracks) {
      track.resetRuntimeState();
    }
    this.adapter.updateVisuals?.(looperState);
  }

  startPlayback(looperState, now = performance.now(), { resume = false } = {}) {
    const data = looperState?.looperData;
    if (!data?.timeline?.hasRecording() || data.transport.recording) {
      return false;
    }

    const timing = this.getTimingForLooper(looperState, now);
    if (timing.connected) return this.armPlayback(looperState, now, timing);

    const shouldResume = resume && data.transport.paused;
    const transition = data.transport.play({ restart: !shouldResume });
    if (!transition.accepted) {
      return false;
    }

    this.adapter.ensureAudio?.();
    this.applier.clearLooper(looperState);
    if (!shouldResume) {
      data.playbackEngine.stop({
        onReleaseTrack: (trackId) => this.releaseTrackById(looperState, trackId),
      });
    }

    data.lastPlaybackUpdateMs = now;
    data.clockPlaybackStartBeatPosition = null;
    data.playbackEngine.start(now, { resume: shouldResume });
    this.updatePlaybackForLooper(looperState, now);
    this.adapter.updateVisuals?.(looperState);
    return true;
  }

  armPlayback(looperState, now, timing) {
    const data = looperState.looperData;
    this.adapter.ensureAudio?.();
    this.stopPlayback(looperState);
    data.armedAction = "play";
    data.armedAtMs = now;
    data.armedAfterBeatOrdinal = hasBeatGrid(timing)
      ? Math.floor(timing.beatPosition + 1e-9)
      : null;
    data.clockMetronomeId = timing.metronomeId;
    data.transport.armPlay();
    this.adapter.updateVisuals?.(looperState);
    return true;
  }

  resumePlayback(looperState, now = performance.now()) {
    return this.startPlayback(looperState, now, { resume: true });
  }

  pausePlayback(looperState, now = performance.now()) {
    const data = looperState?.looperData;
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

  stopPlayback(looperState) {
    const data = looperState?.looperData;
    if (!data) {
      return;
    }

    data.playbackEngine.stop({
      onReleaseTrack: (trackId) => this.releaseTrackById(looperState, trackId),
    });
    this.applier.clearLooper(looperState);
    if (!data.transport.recording) {
      data.transport.stop();
    }
    data.lastPlaybackUpdateMs = 0;
    data.clockPlaybackStartBeatPosition = null;
    this.clearArmedState(data);
    for (const track of data.tracks) {
      track.isPlaying = false;
    }
    this.adapter.updateVisuals?.(looperState);
  }

  updateRecordings(looperStates, now = performance.now()) {
    for (const looperState of looperStates) {
      const data = looperState.looperData;
      if (!data || !looperState.root?.visible) {
        continue;
      }

      if (data.transport.recordArmed) {
        if (!this.hasArmedTrackOnset(data)) continue;
        if (!this.beginArmedRecordingFromOnset(looperState, now)) continue;
      }
      if (!data.transport.recording) continue;

      if (data.timeline.getElapsedMs(now) >= LOOPER_MAX_RECORDING_DURATION_MS) {
        this.stopRecording(looperState, now);
        continue;
      }

      for (const track of data.tracks) {
        this.recorder.updateTrack(
          data.timeline,
          track,
          now,
          (honkId) => this.captureActionByHonkId(honkId),
        );
      }
      this.adapter.updateVisuals?.(looperState);
    }
  }

  hasArmedTrackOnset(data) {
    return data.tracks.some((track) =>
      this.recorder.isMusicalOnset(
        this.captureActionByHonkId(track.connectedHonkId),
      ),
    );
  }

  beginArmedRecordingFromOnset(looperState, now) {
    const data = looperState?.looperData;
    if (!data?.transport.recordArmed) return false;
    const timing = this.getTimingForLooper(looperState, now);
    if (!timing.connected || !hasBeatGrid(timing)) return false;
    const beatOrdinal = Math.floor(timing.beatPosition + 1e-9);
    const beatStartMs = timing.beatOriginMs + beatOrdinal * timing.beatIntervalMs;
    return this.beginRecording(looperState, beatStartMs, timing);
  }

  updatePlayback(looperStates, now = performance.now()) {
    for (const looperState of looperStates) {
      this.updatePlaybackForLooper(looperState, now);
    }
  }

  updatePlaybackForLooper(looperState, now = performance.now()) {
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
      onDrumHit: (_trackTimeline, event) => {
        this.adapter.playStickPercussion?.(event.value, {
          volume: data.volume,
          looperState,
        });
      },
      onReleaseTrack: (trackId) => this.releaseTrackById(looperState, trackId),
      onLoopBoundary: () => this.handleLoopBoundary(looperState),
    };
    const timing = this.getTimingForLooper(looperState, now);
    if (timing.connected) {
      if (!hasBeatGrid(timing) || !Number.isFinite(data.clockPlaybackStartBeatPosition)) return;
      const recordedBeatIntervalMs = data.timeline.beatIntervalMs || timing.beatIntervalMs;
      const totalElapsedMs = Math.max(
        timing.beatPosition - data.clockPlaybackStartBeatPosition,
        0,
      ) * recordedBeatIntervalMs;
      data.playbackEngine.updateFromClock(totalElapsedMs, data.timeline, handlers);
      return;
    }
    data.playbackEngine.update(now, data.timeline, 1, handlers);
  }

  updateAutomationAudio() {
    this.applier.updateAudio();
  }

  getTimingForLooper(looperState, now = performance.now()) {
    return this.adapter.getTimingForLooper?.(looperState?.id, now) || {
      active: false,
      connected: false,
    };
  }

  updateClockedTransports(looperStates, now = performance.now()) {
    for (const looperState of looperStates) {
      const data = looperState?.looperData;
      if (!data || looperState.root?.visible === false) continue;
      const timing = this.getTimingForLooper(looperState, now);
      if (!timing.connected) {
        continue;
      }
      data.clockMetronomeId = timing.metronomeId;
      if (!hasBeatGrid(timing)) continue;
      if (data.armedAction !== "record" && data.armed && this.isArmedBeatDue(data, timing)) {
        this.launchArmedStart(looperState, timing, now);
      }
    }
  }

  isArmedBeatDue(data, timing) {
    const dueOrdinal = Math.floor(timing.beatPosition + 1e-9);
    return data.armedAfterBeatOrdinal === null || dueOrdinal > data.armedAfterBeatOrdinal;
  }

  launchArmedStart(looperState, timing, now) {
    const data = looperState.looperData;
    const action = data.armedAction;
    const beatOrdinal = Math.floor(timing.beatPosition + 1e-9);
    const beatStartMs = timing.beatOriginMs + beatOrdinal * timing.beatIntervalMs;
    this.clearArmedState(data);
    if (action === "pause") {
      this.pausePlaybackImmediately(looperState);
      return;
    }
    if (action === "play") {
      data.transport.play({ restart: true });
      data.playbackEngine.start(beatStartMs);
      data.clockPlaybackStartBeatPosition = beatOrdinal;
      data.lastPlaybackUpdateMs = now;
      this.updatePlaybackForLooper(looperState, now);
      this.adapter.updateVisuals?.(looperState);
    }
  }

  cancelArmedStart(looperState) {
    const data = looperState?.looperData;
    if (!data?.armed) return false;
    const pauseWasArmed = data.pauseArmed;
    this.clearArmedState(data);
    if (!pauseWasArmed) data.transport.stop();
    this.adapter.updateVisuals?.(looperState);
    return true;
  }

  clearArmedState(data) {
    data.armedAction = null;
    data.armedAfterBeatOrdinal = null;
    data.armedAtMs = 0;
  }

  handleClockDisconnected(looperState) {
    const data = looperState?.looperData;
    if (!data) return;
    if (data.transport.recording) {
      this.stopRecording(looperState);
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
    const track = looperState?.looperData?.tracks?.find((candidate) => candidate.trackId === trackId);
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
      this.recorder.releaseTrackActions(
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

  recordTrackDrumHit(looperState, track, drumType, now = performance.now()) {
    const data = looperState?.looperData;
    if (!data || !track || !drumType) {
      return false;
    }
    if (data.transport.recordArmed && !this.beginArmedRecordingFromOnset(looperState, now)) {
      return false;
    }
    if (!data.transport.recording) {
      return false;
    }

    const elapsedMs = data.timeline.getElapsedMs(now);
    data.timeline.markMusicalOnset(elapsedMs);
    const event = data.timeline.addDrumHitEvent(track.trackId, {
      nodeId: track.nodeId,
      trackIndex: track.index,
      timeMs: elapsedMs,
      drumType,
    });
    if (!event) {
      return false;
    }

    track.isRecording = true;
    track.active = true;
    this.adapter.updateVisuals?.(looperState);
    return true;
  }

  recordSelfDrumHit(looperState, drumType, now = performance.now()) {
    const data = looperState?.looperData;
    if (!data || !drumType) {
      return false;
    }
    if (data.transport.recordArmed && !this.beginArmedRecordingFromOnset(looperState, now)) {
      return false;
    }
    if (!data.transport.recording) {
      return false;
    }

    const elapsedMs = data.timeline.getElapsedMs(now);
    data.timeline.markMusicalOnset(elapsedMs);
    const event = data.timeline.addDrumHitEvent(LOOPER_SELF_PERCUSSION_TRACK_ID, {
      nodeId: LOOPER_SELF_PERCUSSION_TRACK_ID,
      timeMs: elapsedMs,
      drumType,
    });
    if (!event) {
      return false;
    }

    this.adapter.updateVisuals?.(looperState);
    return true;
  }

  setControlValue(looperState, control, value) {
    const data = looperState?.looperData;
    if (!data) {
      return null;
    }
    const clamped = Math.min(Math.max(value, -1), 1);
    if (control === "gap") {
      data.gapBeats = LooperControlMapping.getGapBeatsFromControl(clamped);
      data.gapControlValue = LooperControlMapping.getGapControlFromBeats(data.gapBeats);
      if (!data.transport.recording && data.timeline?.hasRecording()) {
        data.timeline.setGapBeats(data.gapBeats, LOOPER_MIN_ACTION_DURATION_MS);
        data.durationMs = data.timeline.durationMs;
      }
      return data.gapControlValue;
    } else if (control === "volume") {
      data.volumeControlValue = clamped;
      data.volume = LooperControlMapping.getVolumeFromControl(clamped);
    } else {
      return null;
    }
    return clamped;
  }

  serializeState(looperState) {
    const data = looperState?.looperData;
    if (!data) {
      return null;
    }
    return {
      controls: {
        volume: data.volumeControlValue,
        gap: data.gapControlValue,
      },
      timeline: data.timeline.toJSON(),
      connections: this.connections.serializeConnections(looperState),
    };
  }

  restoreState(
    looperState,
    serialized = {},
    { restoreConnections = false, preserveConnections = false } = {},
  ) {
    const data = looperState?.looperData;
    if (!data) {
      return false;
    }

    this.clearRuntimeState(looperState);
    if (!preserveConnections) {
      for (const track of data.tracks) {
        if (track.connectedHonkId !== null && track.connectedHonkId !== undefined) {
          this.connections.disconnect(looperState, track.index);
        }
      }
    }
    data.timeline = LooperTimeline.fromJSON(serialized.timeline || {});
    data.hasRecording = data.timeline.hasRecording();
    data.durationMs = data.timeline.durationMs;
    this.syncTrackActivityFromTimeline(looperState);

    const controls = serialized.controls || {};
    this.setControlValue(
      looperState,
      "volume",
      controls.volume ?? LOOPER_CONTROL_DEFAULT_VALUES.volume,
    );
    this.setControlValue(
      looperState,
      "gap",
      controls.gap ?? LOOPER_CONTROL_DEFAULT_VALUES.gap,
    );

    if (restoreConnections) {
      this.restoreConnections(looperState, serialized.connections);
    }
    this.adapter.updateVisuals?.(looperState);
    return true;
  }

  restoreConnections(looperState, serializedConnections = []) {
    return this.connections.restoreConnections(looperState, serializedConnections);
  }

  syncTrackActivityFromTimeline(looperState) {
    const data = looperState?.looperData;
    if (!data) {
      return;
    }
    for (const track of data.tracks) {
      track.active = Boolean(data.timeline.getTrack(track.trackId)?.active);
    }
  }

  clearRuntimeState(looperState) {
    const data = looperState?.looperData;
    if (!data) {
      return;
    }

    this.stopPlayback(looperState);
    data.timeline.recording = false;
    data.transport.reset();
    this.clearArmedState(data);
    data.clockMetronomeId = null;
    data.clockPlaybackStartBeatPosition = null;
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
      this.stopRecording(looperState);
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

function hasBeatGrid(timing) {
  return Boolean(
    timing?.connected &&
    timing.beatIntervalMs > 0 &&
    Number.isFinite(timing.beatOriginMs) &&
    Number.isFinite(timing.beatPosition)
  );
}
