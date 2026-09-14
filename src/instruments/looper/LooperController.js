import {
  LOOPER_GESTURE_EVENT_EPSILONS,
  LOOPER_GESTURE_SAMPLE_INTERVAL_MS,
  LOOPER_MAX_RECORDING_DURATION_MS,
  LOOPER_BEAT_DETECTION_SETTINGS,
  LOOPER_CONTROL_DEFAULT_VALUES,
  LOOPER_MIN_ACTION_DURATION_MS,
  LOOPER_TRACK_COUNT,
  LOOPER_STANDALONE_BPM,
} from "../../config/looper.js";
import { LooperConnectionManager } from "./LooperConnectionManager.js";
import { LooperBeatDetector } from "./LooperBeatDetector.js";
import { LooperControlMapping, getRecordLengthDetent } from "./looperControlMapping.js";
import { LooperGestureApplier } from "./LooperGestureApplier.js";
import { LooperGestureRecorder } from "./LooperGestureRecorder.js";
import { getLooperNodeName } from "./looperNames.js";
import { LooperPlaybackEngine } from "./LooperPlaybackEngine.js";
import { LooperTrack } from "./LooperTrack.js";
import { LooperTransport } from "./LooperTransport.js";
import { LooperTimeline } from "./timeline/LooperTimeline.js";
import { LooperActionEventType } from "./timeline/LooperActionEvent.js";
import { createActionState } from "./timeline/actionState.js";

const LOOPER_SELF_PERCUSSION_TRACK_ID = "looper-self-percussion";
const AUDIO_SCHEDULER_INTERVAL_MS = 25;
const AUDIO_LOOKAHEAD_MS = 120;
const AUDIO_MAX_LATE_MS = 80;
// Beat equality tolerance only (less than one nanosecond at lesson tempo).
export const BEAT_EQUALITY_EPSILON = 1e-9;
export const nextBeatAfter = position => Math.floor(position + BEAT_EQUALITY_EPSILON) + 1;

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
      takeRevision: 0,
      activityRevision: 0,
      durationMs: 0,
      buttonMorphReleaseTimes: new Map(),
      playingHeadMorphValue: 0,
      playingHeadMorphTarget: 0,
      playingHeadMorphPhase: 0,
      lastPlayingHeadMorphUpdateMs: 0,
      lastPlaybackUpdateMs: 0,
      audioScheduling: {
        timer: null,
        startWallMs: 0,
        startSourceMs: 0,
        scheduledThroughSourceMs: 0,
        includeStart: true,
        lastRate: 1,
      },
      recordingBeatIntervalMs: 0,
      recordBeats: 16,
      recordLengthControlValue: 1,
      latchedRecordBeats: 16,
      recordingWindow: null,
      recordingCompletion: null,
      localClockOriginMs: 0,
      pendingLaunch: null,
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
    if (!timing.active) return false;
    return this.armRecording(looperState, now, timing);
  }

  armRecording(looperState, now, timing) {
    const data = looperState.looperData;
    if (data.transport.recordArmed) return true;
    if (data.transport.recording) this.stopRecording(looperState, now);
    this.stopPlayback(looperState);
    data.takeRevision++;
    data.armedAction = "record";
    data.armedAtMs = now;
    data.armedAfterBeatOrdinal = null;
    data.clockMetronomeId = timing.metronomeId;
    data.latchedRecordBeats = data.recordBeats;
    data.recordingWindow = null;
    data.recordingCompletion = null;
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
    if (hasBeatGrid(timing)) {
      const startBeat = Math.floor(timing.beatPosition + BEAT_EQUALITY_EPSILON);
      const beats = data.latchedRecordBeats;
      data.recordingWindow = { startBeat, endBeat:startBeat + beats, beats, firstOnsetBeat:timing.beatPosition,
        firstOnsetMs:now, metronomeId:timing.metronomeId, sourceBeatIntervalMs:timing.beatIntervalMs, lastTiming:timing, lastTimingAtMs:now };
      data.timeline.startedAtMs = now - Math.max(0, timing.beatPosition - startBeat) * timing.beatIntervalMs;
      data.timeline.recordingClock = time => {
        const phase = this.getRecordingTiming(looperState, time).beatPosition;
        // Nanosecond precision removes floating-point residue at beat equality.
        return Math.round((phase - startBeat) * timing.beatIntervalMs * 1e6) / 1e6;
      };
    }
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

    const window = data.recordingWindow;
    const timing = this.getRecordingTiming(looperState, now);
    const automatic = Boolean(window && timing.beatPosition + BEAT_EQUALITY_EPSILON >= window.endBeat);
    if (automatic) {
      data.timeline.lengthMode = 'fixed-window';
      data.timeline.fixedWindowBeats = window.beats;
    }
    data.takeRevision++;
    data.hasRecording = this.recorder.stop(
      data.timeline,
      data.tracks,
      now,
      LOOPER_MIN_ACTION_DURATION_MS,
      (honkId) => this.captureActionByHonkId(honkId),
      null,
      { endpointMs: automatic ? window.beats * window.sourceBeatIntervalMs : null },
    );
    if (data.timeline.timingMode === "ordinary") {
      const beatAnalysis = this.beatDetector.analyze(data.timeline, {
        fallbackBeatIntervalMs: data.recordingBeatIntervalMs,
      });
      if (beatAnalysis) {
        // Tempo inference is metadata only. Moving gates while leaving their
        // expressive curves at the performed times changes attacks, releases,
        // and short-note duration.
        data.timeline.beatIntervalMs = beatAnalysis.beatIntervalMs;
        data.timeline.beatAnalysis = { ...beatAnalysis };
        data.timeline.finalizeDuration(LOOPER_MIN_ACTION_DURATION_MS);
      } else {
        // Tempo inference does not add silence or change musical boundaries.
        data.timeline.normalizeToFirstAction();
        data.timeline.finalizeDuration(LOOPER_MIN_ACTION_DURATION_MS);
      }
    }
    data.timeline.setGapBeats(data.gapBeats, LOOPER_MIN_ACTION_DURATION_MS);
    data.recordingBeatIntervalMs = 0;
    data.durationMs = data.timeline.durationMs;
    data.transport.finishRecording();
    data.recordingCompletion = { automatic, beats:data.timeline.recordedDurationMs / (data.timeline.sourceBeatIntervalMs || data.timeline.beatIntervalMs || 1),
      endBeat:automatic ? window.endBeat : timing.beatPosition, observedAtMs:now };
    if (automatic) this.adapter.onAutomaticRecordingStop?.(looperState, now);
    this.adapter.updateVisuals?.(looperState);
    return data.hasRecording;
  }

  clearRecording(looperState) {
    const data = looperState?.looperData;
    if (!data) {
      return;
    }

    this.stopPlayback(looperState);
    data.takeRevision++;
    data.timeline.clearRecording();
    data.recordingWindow = null;
    data.recordingCompletion = null;
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
    if (!data) return false;
    const timing = this.getTimingForLooper(looperState, now);
    if (!timing.active || !hasBeatGrid(timing)) return false;
    if (timing.connected && !resume) {
      const candidates = this.adapter.getLoopers?.() || looperState.instrumentRegistry?.getByKind?.('looper') || [looperState];
      return LooperController.startAll(candidates, now, {metronomeId:timing.metronomeId, fallbackController:this}).ok;
    }
    if (!data.timeline?.hasRecording() || data.transport.recording || data.transport.recordArmed) return false;
    return this.armPlayback(looperState, now, timing, {resume});
  }

  armPlayback(looperState, now, timing, { targetBeat = nextBeatAfter(timing.beatPosition), resume = false, audioAnchor = null } = {}) {
    const data = looperState.looperData;
    this.adapter.ensureAudio?.();
    // Restart requests leave the old take sounding until the shared boundary.
    if (data.pendingLaunch && this.isArmedBeatDue(data, timing)) this.launchArmedStart(looperState, timing, now);
    if (data.pendingLaunch?.targetBeat === targetBeat) {
      if (audioAnchor && data.pendingLaunch.audioAnchor !== audioAnchor) {
        const prepared = data.pendingLaunch.prepared;
        data.pendingLaunch.audioAnchor = audioAnchor;
        data.pendingLaunch.prepared = false;
        if (prepared) {
          this.prepareArmedAudio(looperState, timing, now);
          this.schedulePlaybackAudioForLooper(looperState, now);
        }
      }
      return true;
    }
    data.armedAction = 'play';
    data.armedAtMs = now;
    data.armedAfterBeatOrdinal = targetBeat - 1;
    data.clockMetronomeId = timing.metronomeId;
    data.pendingLaunch = {targetBeat, requestedAtMs:now, prepared:false,
      audioAnchor:audioAnchor || {wallMs:now,audioSeconds:this.adapter.getAudioCurrentTime?.()},
      resumeSourceMs:resume && data.transport.paused ? data.playbackEngine.elapsedMs : 0};
    if (!data.transport.playing) data.transport.armPlay();
    this.startAudioScheduler(looperState, now);
    this.adapter.updateVisuals?.(looperState);
    return true;
  }

  static startAll(loopers, now = performance.now(), {metronomeId = null, fallbackController = null} = {}) {
    const eligible = [];
    for (const looper of new Set(loopers)) {
      const controller = looper?.looperController || fallbackController, data = looper?.looperData;
      if (!controller || looper.disposed || looper.root?.visible === false || !data?.timeline.hasRecording() || data.transport.recording || data.transport.recordArmed) continue;
      const timing = controller.getTimingForLooper(looper, now);
      if (!timing.connected || !timing.active || !hasBeatGrid(timing)) continue;
      metronomeId ??= timing.metronomeId;
      if (timing.metronomeId === metronomeId) eligible.push({looper,controller,timing});
    }
    if (!eligible.length) return {ok:false,message:'No recorded loopers available on this Metronome.'};
    const targetBeat = nextBeatAfter(eligible[0].timing.beatPosition);
    const existing = eligible.find(({looper}) => looper.looperData.pendingLaunch?.targetBeat === targetBeat);
    const audioAnchor = existing?.looper.looperData.pendingLaunch.audioAnchor || {wallMs:now,audioSeconds:eligible[0].controller.adapter.getAudioCurrentTime?.()};
    for (const {looper,controller,timing} of eligible) controller.armPlayback(looper, now, timing, {targetBeat,audioAnchor});
    return {ok:true,message:`Starting ${eligible.length} linked looper${eligible.length === 1 ? '' : 's'} on the next beat`,targetBeat,requestedAtMs:now,looperIds:eligible.map(({looper})=>looper.id)};
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

    this.stopAudioScheduler(looperState);
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

    this.stopAudioScheduler(looperState);
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
      if (!this.getTimingForLooper(looperState, now).active) { this.stopRecording(looperState, now); continue; }
      if (this.finishRecordingIfDue(looperState, now)) continue;

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
    if (!timing.active || !hasBeatGrid(timing)) return false;
    // The first sound chooses its preceding beat, retaining the onset offset.
    return this.beginRecording(looperState, now, timing);
  }

  finishRecordingIfDue(looper, now) {
    const data = looper?.looperData, window = data?.recordingWindow;
    if (!data?.transport.recording || !window) return false;
    if (this.getRecordingTiming(looper, now).beatPosition + BEAT_EQUALITY_EPSILON < window.endBeat) return false;
    this.stopRecording(looper, now);
    return true;
  }

  getRecordingTiming(looper, now) {
    const timing = this.getTimingForLooper(looper, now), window = looper?.looperData?.recordingWindow;
    if (!window) return timing;
    // Disconnection's normal Stop runs after the cable is removed. Finalize
    // against the last connected clock, never an unrelated internal origin.
    if (timing.metronomeId !== window.metronomeId) {
      const previous = window.lastTiming;
      return {...previous, beatPosition:previous.beatPosition + (now - window.lastTimingAtMs) / previous.beatIntervalMs};
    }
    window.lastTiming = timing;
    window.lastTimingAtMs = now;
    return timing;
  }

  getRecordingProgress(looper, now = performance.now()) {
    const data = looper?.looperData;
    if (!data) return null;
    if (data.transport.recordArmed) return {state:'armed', beats:data.latchedRecordBeats};
    const window = data.recordingWindow;
    if (data.transport.recording && window) {
      const elapsedBeats = Math.max(0, this.getRecordingTiming(looper, now).beatPosition - window.startBeat);
      return {state:'recording', startBeat:window.startBeat, endBeat:window.endBeat, beats:window.beats,
        elapsedBeats, beat:Math.min(window.beats, Math.floor(elapsedBeats + BEAT_EQUALITY_EPSILON) + 1), remainingBeats:Math.max(0,window.beats - elapsedBeats)};
    }
    return data.recordingCompletion ? {state:'complete', ...data.recordingCompletion} : null;
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
      onDrumHit: typeof this.adapter.getAudioCurrentTime === "function" ? null : (_trackTimeline, event) => {
        if (typeof this.adapter.getAudioCurrentTime !== "function") {
          this.adapter.playStickPercussion?.(event.value, {
            volume: data.volume,
            looperState,
          });
        }
      },
      onReleaseTrack: (trackId) => this.releaseTrackById(looperState, trackId),
      onLoopTrackReset: () => {},
      onLoopBoundary: () => this.handleLoopBoundary(looperState),
    };
    const timing = this.getTimingForLooper(looperState, now);
    if (hasBeatGrid(timing)) {
      if (!timing.active || !hasBeatGrid(timing) || !Number.isFinite(data.clockPlaybackStartBeatPosition)) return;
      const interval = this.getSourceBeatInterval(data.timeline);
      const totalElapsedMs = interval > 0
        ? Math.max(timing.beatPosition-data.clockPlaybackStartBeatPosition,0)*interval + (data.playbackSourceOffsetMs || 0)
        : Math.max(now-data.audioScheduling.startWallMs,0);
      data.playbackEngine.updateFromClock(totalElapsedMs, data.timeline, handlers);
      this.reconcilePlaybackAudioTargets(looperState, now);
      return;
    }
    data.playbackEngine.update(now, data.timeline, 1, handlers);
    this.reconcilePlaybackAudioTargets(looperState, now);
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
    return {active:true,connected:false,internal:true,bpm:LOOPER_STANDALONE_BPM,
      beatIntervalMs,beatOriginMs,beatPosition:(now-beatOriginMs)/beatIntervalMs,metronomeId:null};
  }

  updateClockedTransports(looperStates, now = performance.now()) {
    for (const looper of looperStates) {
      const data = looper?.looperData;
      if (!data || looper.root?.visible === false) continue;
      const timing = this.getTimingForLooper(looper, now);
      if (data.pendingLaunch && data.clockMetronomeId !== timing.metronomeId) { this.cancelArmedStart(looper); continue; }
      if (!timing.active) {
        if (data.playing || data.playArmed) this.stopPlayback(looper);
        continue;
      }
      if (data.armedAction === 'pause' && this.isArmedBeatDue(data, timing)) this.launchArmedStart(looper, timing, now);
      else if (data.pendingLaunch && this.isArmedBeatDue(data, timing)) {
        this.prepareArmedAudio(looper, timing, now);
        this.launchArmedStart(looper, timing, now);
      }
    }
  }

  isArmedBeatDue(data, timing) {
    return hasBeatGrid(timing) && timing.beatPosition + BEAT_EQUALITY_EPSILON >= (data.armedAfterBeatOrdinal ?? -1) + 1;
  }

  prepareArmedAudio(looper, timing, now) {
    const data = looper.looperData, pending = data.pendingLaunch;
    if (!pending || pending.prepared) return;
    const boundaryMs = now + (pending.targetBeat - timing.beatPosition)*timing.beatIntervalMs;
    data.audioScheduling.audioAnchor = pending.audioAnchor;
    const audioNow = this.getSchedulingAudioTime(looper, now);
    const scheduledTime = Number.isFinite(audioNow) ? audioNow + Math.max(boundaryMs-now,0)/1000 : undefined;
    this.applier.cancelScheduledAudio(looper, {scheduledTime});
    this.adapter.cancelLooperPercussion?.(looper.id, {scheduledTime});
    data.playbackGeneration++;
    pending.prepared = true;
    pending.audioPreparedAtMs = now;
    pending.audioOriginTime = Number.isFinite(audioNow) ? audioNow+(boundaryMs-now)/1000 : null;
    data.audioScheduling.originBeat = pending.targetBeat;
    data.audioScheduling.startWallMs = boundaryMs;
    data.audioScheduling.startSourceMs = pending.resumeSourceMs;
    data.audioScheduling.scheduledThroughSourceMs = pending.resumeSourceMs;
    data.audioScheduling.includeStart = true;
    data.audioScheduling.percussionTimes = [];
    data.playbackReferenceBeatIntervalMs = this.getSourceBeatInterval(data.timeline);
    data.audioScheduling.lastRate = this.getPlaybackRate(looper, now);
    const lateSource = this.getAbsoluteSourcePosition(looper, now);
    if (lateSource > pending.resumeSourceMs + 1e-6) {
      data.audioScheduling.scheduledThroughSourceMs = lateSource;
      data.audioScheduling.includeStart = false;
      if (Number.isFinite(audioNow)) this.reconcileScheduledAudioAtSource(looper, lateSource, audioNow);
    } else if (pending.resumeSourceMs > 0 && Number.isFinite(scheduledTime)) {
      this.reconcileScheduledAudioAtSource(looper, pending.resumeSourceMs, scheduledTime);
    }
    data.timeline.forEachActiveTrack(t => {
      const track = this.getTrack(looper, t.trackIndex);
      if (track) this.applier.initializeAudioTargets(looper, track);
    });
  }

  launchArmedStart(looper, timing, now) {
    const data = looper.looperData, pending = data.pendingLaunch;
    if (data.armedAction === 'pause') {
      this.clearArmedState(data); this.pausePlaybackImmediately(looper); return;
    }
    if (!pending) return;
    this.prepareArmedAudio(looper, timing, now);
    data.transport.play({restart:true});
    this.applier.clearVisuals(looper);
    data.playbackEngine.start(data.audioScheduling.startWallMs);
    data.clockPlaybackStartBeatPosition = pending.targetBeat;
    data.playbackSourceOffsetMs = pending.resumeSourceMs;
    data.launchHistory.push({beat:pending.targetBeat,requestedAtMs:pending.requestedAtMs,observedAtMs:now,audioPreparedAtMs:pending.audioPreparedAtMs,audioOriginTime:pending.audioOriginTime,lateMs:Math.max(now-data.audioScheduling.startWallMs,0)});
    if (data.launchHistory.length > 32) data.launchHistory.shift();
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

  startAudioScheduler(looper, now) {
    const scheduling = looper.looperData.audioScheduling;
    if (typeof this.adapter.getAudioCurrentTime !== 'function') return;
    if (scheduling.timer === null) {
      scheduling.timer = globalThis.setInterval?.(() => this.schedulePlaybackAudioForLooper(looper, performance.now()), AUDIO_SCHEDULER_INTERVAL_MS) || null;
      scheduling.timer?.unref?.();
    }
    this.schedulePlaybackAudioForLooper(looper, now);
  }

  stopAudioScheduler(looperState, { release = true } = {}) {
    const scheduling = looperState?.looperData?.audioScheduling;
    if (!scheduling) return;
    if (scheduling.timer !== null) globalThis.clearInterval?.(scheduling.timer);
    scheduling.timer = null;
    if (release) {
      this.applier.cancelScheduledAudio?.(looperState);
      this.adapter.cancelLooperPercussion?.(looperState.id);
    }
  }

  getSchedulingAudioTime(looper, now) {
    const anchor = looper.looperData.audioScheduling.audioAnchor;
    return Number.isFinite(anchor?.audioSeconds)
      ? anchor.audioSeconds + (now-anchor.wallMs)/1000
      : this.adapter.getAudioCurrentTime?.();
  }

  getSourceBeatInterval(timeline) {
    return timeline.sourceBeatIntervalMs || (timeline.timingMode === 'metronome' ? timeline.beatIntervalMs : 0);
  }

  getPlaybackRate(looper, now) {
    const interval = this.getSourceBeatInterval(looper.looperData.timeline);
    const timing = this.getTimingForLooper(looper, now);
    return interval > 0 && timing.beatIntervalMs > 0 ? interval/timing.beatIntervalMs : 1;
  }

  getAbsoluteSourcePosition(looper, now) {
    const data = looper.looperData, timing = this.getTimingForLooper(looper, now), scheduling = data.audioScheduling;
    const interval = this.getSourceBeatInterval(data.timeline);
    if (interval > 0 && hasBeatGrid(timing) && Number.isFinite(scheduling.originBeat)) {
      return (timing.beatPosition-scheduling.originBeat)*interval + scheduling.startSourceMs;
    }
    // Legacy takes without trustworthy source tempo retain their millisecond timing.
    return scheduling.startSourceMs + now-scheduling.startWallMs;
  }

  schedulePlaybackAudioForLooper(looperState, now = performance.now()) {
    const data = looperState?.looperData;
    if ((!data?.transport.playing && !data?.pendingLaunch) || !data.timeline?.hasRecording()) return;
    const timing = this.getTimingForLooper(looperState, now);
    if (looperState.disposed || looperState.root?.visible === false || data.pendingLaunch && data.clockMetronomeId !== timing.metronomeId) { this.stopPlayback(looperState); return; }
    if (!timing.active) { this.stopPlayback(looperState); return; }
    const pending = data.pendingLaunch;
    if (pending && (pending.targetBeat-timing.beatPosition)*timing.beatIntervalMs <= AUDIO_LOOKAHEAD_MS) {
      this.prepareArmedAudio(looperState, timing, now);
      if (this.isArmedBeatDue(data, timing)) this.launchArmedStart(looperState, timing, now);
    }
    if (!data.transport.playing && !pending?.prepared) return;
    const audioNow = this.getSchedulingAudioTime(looperState, now);
    if (!Number.isFinite(audioNow)) return;
    this.applier.pruneScheduledAudio?.(audioNow);
    const scheduling = data.audioScheduling;
    const sourceNow = this.getAbsoluteSourcePosition(looperState, now);
    const rate = Math.max(this.getPlaybackRate(looperState, now), 0.0001);
    if (sourceNow >= 0 && !data.pendingLaunch) this.reconcilePlaybackAudioTargets(looperState, now, { sourceNow, audioNow, rate });
    if (Math.abs(rate - scheduling.lastRate) > 1e-9) {
      this.applier.cancelScheduledAudio?.(looperState);
      this.adapter.cancelLooperPercussion?.(looperState.id);
      scheduling.scheduledThroughSourceMs = Math.max(sourceNow, 0);
      scheduling.includeStart = true;
      scheduling.lastRate = rate;
      if (sourceNow >= 0) this.reconcileScheduledAudioAtSource(looperState, sourceNow, audioNow);
    }
    if (sourceNow - scheduling.scheduledThroughSourceMs > AUDIO_MAX_LATE_MS * rate) {
      // Work older than the scheduling horizon cannot be repaired in Web Audio.
      // Drop that bounded interval and reconcile from the current phase.
      this.applier.cancelScheduledAudio?.(looperState);
      this.adapter.cancelLooperPercussion?.(looperState.id);
      scheduling.scheduledThroughSourceMs = Math.max(sourceNow, 0);
      scheduling.includeStart = true;
      if (sourceNow >= 0) this.reconcileScheduledAudioAtSource(looperState, sourceNow, audioNow);
    }
    let sourceEnd = sourceNow + AUDIO_LOOKAHEAD_MS * rate;
    if (data.pendingLaunch && !data.pendingLaunch.prepared) {
      const untilBoundary = (data.pendingLaunch.targetBeat-timing.beatPosition)*timing.beatIntervalMs;
      sourceEnd = Math.min(sourceEnd, sourceNow+untilBoundary*rate-1e-6);
    }
    if (sourceEnd < scheduling.scheduledThroughSourceMs) return;
    this.scheduleSourceRange(
      looperState,
      scheduling.scheduledThroughSourceMs,
      sourceEnd,
      {
        includeStart: scheduling.includeStart,
        sourceNow,
        rate,
        audioNow,
      },
    );
    scheduling.scheduledThroughSourceMs = sourceEnd;
    scheduling.includeStart = false;
  }

  scheduleSourceRange(looperState, absoluteStartMs, absoluteEndMs, clock) {
    const data = looperState.looperData;
    const durationMs = Math.max(data.timeline.durationMs, 1);
    // Compute each cycle once, rather than repeatedly adding its fractional
    // duration and dividing again. Floating error at a shared window boundary
    // must not skip or repeat the next time-zero attack.
    const cycleAt = time => {
      const nearest = Math.round(time / durationMs);
      return Math.abs(time - nearest * durationMs) < 1e-7 ? nearest : Math.floor(time / durationMs);
    };
    const firstCycle = cycleAt(absoluteStartMs), lastCycle = cycleAt(absoluteEndMs);
    for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
      const includeStart = cycle === firstCycle ? clock.includeStart : true;
      const cycleStart = cycle * durationMs;
      const localStart = cycle === firstCycle ? Math.max(absoluteStartMs - cycleStart, 0) : 0;
      const localEnd = cycle === lastCycle ? Math.max(absoluteEndMs - cycleStart, 0) : durationMs;
      const eventSource = clock.trackTimeline || data.timeline;
      const entries = eventSource.getPerformanceEventsBetween(localStart, localEnd, {
        includeStart,
        includeEnd: true,
      }).map((entry) => clock.trackTimeline ? { track: clock.trackTimeline, event: entry } : entry);
      if (includeStart && localStart === 0) {
        for (const value of eventSource.getPerformanceEventsAt(0)) {
          const entry = clock.trackTimeline ? { track: clock.trackTimeline, event: value } : value;
          if (!entries.some((candidate) => candidate.track === entry.track && candidate.event === entry.event)) {
            entries.unshift(entry);
          }
        }
      }
      for (const { track: trackTimeline, event } of entries) {
        const absoluteEventMs = cycleStart + event.timeMs;
        const scheduledTime = clock.audioNow + Math.max(
          (absoluteEventMs - clock.sourceNow) / clock.rate / 1000,
          0,
        );
        const track = this.getTrack(looperState, trackTimeline.trackIndex);
        if (!track) continue;
        const snapshot = createActionState();
        // Event endpoints retain their final expression even at the start of
        // an explicit Gap. Tail-padding neutralization is for visual sampling.
        trackTimeline.sample(event.timeMs, snapshot);
        this.applier.scheduleTrackEvent(looperState, track, trackTimeline, event, snapshot, {
          volume: data.volume,
          scheduledTime,
          noteKey: `${data.playbackGeneration}:` + this.getNoteKeyForEvent(
            trackTimeline,
            event,
            cycle,
            durationMs,
          ),
          targetHonkIds: clock.targetHonkIds,
        });
      }
      const drumEntries = clock.trackTimeline ? [] : data.timeline.getDrumHitEventsBetween(localStart, localEnd, {
        includeStart,
        includeEnd: true,
      });
      for (const { event } of drumEntries) {
        const absoluteEventMs = cycleStart + event.timeMs;
        const scheduledTime = clock.audioNow + Math.max(
          (absoluteEventMs - clock.sourceNow) / clock.rate / 1000,
          0,
        );
        this.adapter.playStickPercussion?.(event.value, {
          volume: data.volume,
          looperState,
          scheduledTime,
        });
        (data.audioScheduling.percussionTimes ||= []).push(scheduledTime);
        if (data.audioScheduling.percussionTimes.length > 32) data.audioScheduling.percussionTimes.shift();
      }
    }
  }

  reconcileScheduledAudioAtSource(looperState, absoluteSourceMs, audioNow) {
    const data = looperState.looperData;
    const durationMs = Math.max(data.timeline.durationMs, 1);
    const localTimeMs = ((absoluteSourceMs % durationMs) + durationMs) % durationMs;
    data.timeline.forEachActiveTrack((trackTimeline) => {
      if (!trackTimeline.sampleGateActive?.(localTimeMs)) return;
      if (trackTimeline.getGateEventsAt(localTimeMs).length > 0) return;
      const track = this.getTrack(looperState, trackTimeline.trackIndex);
      if (!track) return;
      const snapshot = createActionState();
      data.timeline.sampleTrack(trackTimeline, localTimeMs, snapshot);
      this.applier.scheduleTrackEvent(
        looperState,
        track,
        trackTimeline,
        { type: "squeezeStart", timeMs: localTimeMs },
        snapshot,
        {
          volume: data.volume,
          scheduledTime: audioNow,
          noteKey: `${data.playbackGeneration}:` + this.getActiveNoteAtAbsoluteSource(
            trackTimeline,
            absoluteSourceMs,
            durationMs,
          )?.noteKey,
        },
      );
    });
  }

  reconcilePlaybackAudioTargets(
    looperState,
    now = performance.now(),
    resolvedClock = {},
  ) {
    const data = looperState?.looperData;
    if (
      !data?.transport.playing || data.pendingLaunch ||
      typeof this.adapter.getAudioCurrentTime !== "function"
    ) {
      return;
    }
    const audioNow = Number.isFinite(resolvedClock.audioNow)
      ? resolvedClock.audioNow
      : this.getSchedulingAudioTime(looperState, now);
    if (!Number.isFinite(audioNow)) return;
    const sourceNow = Number.isFinite(resolvedClock.sourceNow)
      ? resolvedClock.sourceNow
      : this.getAbsoluteSourcePosition(looperState, now);
    const rate = Number.isFinite(resolvedClock.rate)
      ? resolvedClock.rate
      : Math.max(this.getPlaybackRate(looperState, now), 0.0001);
    const durationMs = Math.max(data.timeline.durationMs, 1);
    const coveredThrough = Math.max(
      sourceNow,
      data.audioScheduling.scheduledThroughSourceMs,
    );

    data.timeline.forEachActiveTrack((trackTimeline) => {
      const track = this.getTrack(looperState, trackTimeline.trackIndex);
      if (!track) return;
      const { joined } = this.applier.reconcileAudioTargets(looperState, track);
      if (joined.length > 0) {
        const activeNote = this.getActiveNoteAtAbsoluteSource(
          trackTimeline,
          sourceNow,
          durationMs,
        );
        if (activeNote) {
          const snapshot = createActionState();
          data.timeline.sampleTrack(trackTimeline, activeNote.localTimeMs, snapshot);
          this.applier.scheduleTrackEvent(
            looperState,
            track,
            trackTimeline,
            { type: LooperActionEventType.SqueezeStart, timeMs: activeNote.localTimeMs },
            snapshot,
            {
              volume: data.volume,
              scheduledTime: audioNow,
              noteKey: `${data.playbackGeneration}:` + activeNote.noteKey,
              targetHonkIds: joined,
            },
          );
        }
        if (coveredThrough > sourceNow) {
          this.scheduleSourceRange(looperState, sourceNow, coveredThrough, {
            includeStart: false,
            sourceNow,
            rate,
            audioNow,
            targetHonkIds: joined,
            trackTimeline,
          });
        }
      }
    });
  }

  getNoteKeyForEvent(trackTimeline, event, cycle, durationMs) {
    const owner = trackTimeline.getOwningNote(event, durationMs);
    return owner ? this.createNoteKey(trackTimeline, cycle + owner.cycleOffset, owner.event) : null;
  }

  getActiveNoteAtAbsoluteSource(trackTimeline, absoluteSourceMs, durationMs) {
    const cycle = Math.floor(absoluteSourceMs / durationMs);
    const localTimeMs = absoluteSourceMs - cycle * durationMs;
    const active = this.getActiveNoteBeforeAbsoluteTime(
      trackTimeline,
      absoluteSourceMs,
      durationMs,
    );
    return active ? { ...active, cycle, localTimeMs } : null;
  }

  getActiveNoteBeforeAbsoluteTime(trackTimeline, absoluteTimeMs, durationMs) {
    const cycle = Math.floor(absoluteTimeMs / durationMs);
    const localTimeMs = absoluteTimeMs - cycle * durationMs;
    const owner = trackTimeline.getActiveNote(localTimeMs, durationMs);
    return owner ? {
      noteKey: this.createNoteKey(trackTimeline, cycle + owner.cycleOffset, owner.event),
      startEvent: owner.event,
    } : null;
  }

  createNoteKey(trackTimeline, cycle, startEvent) {
    return `${trackTimeline.trackId}:cycle-${cycle}:start-${startEvent.id}`;
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

    if (this.finishRecordingIfDue(looperState, now)) return false;
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

    if (this.finishRecordingIfDue(looperState, now)) return false;
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
    if (control === 'recordLength') {
      const detent = getRecordLengthDetent(clamped, data.recordBeats);
      if (data.recordBeats !== detent.beats) data.activityRevision++;
      data.recordBeats = detent.beats;
      data.recordLengthControlValue = detent.value;
      this.adapter.updateVisuals?.(looperState);
      return detent.value;
    } else if (control === "gap") {
      if (data.gapBeats !== LooperControlMapping.getGapBeatsFromControl(clamped)) data.activityRevision++;
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

  serializeState(looperState) {
    const data = looperState?.looperData;
    if (!data) {
      return null;
    }
    return {
      controls: {
        volume: data.volumeControlValue,
        gap: data.gapControlValue,
        recordBeats: data.recordBeats,
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
    data.takeRevision++;
    data.timeline = LooperTimeline.fromJSON(serialized.timeline || {});
    data.hasRecording = data.timeline.hasRecording();
    data.durationMs = data.timeline.durationMs;
    this.syncTrackActivityFromTimeline(looperState);

    const controls = serialized.controls || {};
    this.setControlValue(looperState, 'recordLength', ({2:-1,4:-1/3,8:1/3,16:1})[controls.recordBeats] ?? 1);
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
    (timing?.connected || timing?.internal) &&
    timing.beatIntervalMs > 0 &&
    Number.isFinite(timing.beatOriginMs) &&
    Number.isFinite(timing.beatPosition)
  );
}
