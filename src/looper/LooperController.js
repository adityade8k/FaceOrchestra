import * as THREE from "three";
import {
  LOOPER_GESTURE_SAMPLE_INTERVAL_MS,
  LOOPER_MIN_ACTION_DURATION_MS,
  LOOPER_TRACK_COUNT,
} from "../config/looper.js";
import { LooperAudioEngine } from "../audio/LooperAudioEngine.js";
import { getLooperNodeName } from "../instruments/looperNames.js";
import { LooperTimeline } from "./LooperTimeline.js";
import { LooperPlaybackEngine } from "./LooperPlaybackEngine.js";
import { LooperGestureRecorder } from "./LooperGestureRecorder.js";
import { LooperGestureApplier } from "./LooperGestureApplier.js";
import { LooperConnectionManager } from "./LooperConnectionManager.js";
import { LooperTrack } from "./LooperTrack.js";

const LOOPER_SELF_PERCUSSION_TRACK_ID = "looper-self-percussion";

export class LooperController {
  constructor(adapter = {}) {
    this.adapter = adapter;
    this.recorder = new LooperGestureRecorder({
      sampleIntervalMs: LOOPER_GESTURE_SAMPLE_INTERVAL_MS,
    });
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

    return {
      tracks,
      timeline: new LooperTimeline(),
      playbackEngine: new LooperPlaybackEngine(),
      recording: false,
      playing: false,
      paused: false,
      hasRecording: false,
      durationMs: 0,
      buttonMorphReleaseTimes: new Map(),
      playingHeadMorphValue: 0,
      playingHeadMorphTarget: 0,
      playingHeadMorphPhase: 0,
      lastPlayingHeadMorphUpdateMs: 0,
      lastPlaybackUpdateMs: 0,
      volumeControlValue: 0,
      gapControlValue: -1,
      speedControlValue: 0,
      volume: LooperAudioEngine.getVolumeFromControl(0),
      loopGapMs: LooperAudioEngine.getGapFromControl(-1),
      speed: LooperAudioEngine.getSpeedFromControl(0),
      lastPosition: new THREE.Vector3(),
      lastQuaternion: new THREE.Quaternion(),
    };
  }

  createTimeline() {
    return new LooperTimeline();
  }

  getTrack(looperState, trackIndex) {
    return looperState?.looperData?.tracks?.[trackIndex] || null;
  }

  startRecording(looperState, now = performance.now()) {
    const data = looperState?.looperData;
    if (!data) {
      return;
    }

    this.stopPlayback(looperState);
    data.timeline = new LooperTimeline();
    data.hasRecording = false;
    data.durationMs = 0;
    data.recording = true;
    data.playing = false;
    data.paused = false;

    for (const track of data.tracks) {
      track.resetRuntimeState();
    }

    this.recorder.start(
      data.timeline,
      data.tracks,
      now,
      (honkState) => this.adapter.captureAction?.(honkState) || null,
    );
    this.adapter.updateVisuals?.(looperState);
  }

  stopRecording(looperState, now = performance.now()) {
    const data = looperState?.looperData;
    if (!data?.recording) {
      return;
    }

    data.recording = false;
    data.hasRecording = this.recorder.stop(
      data.timeline,
      data.tracks,
      now,
      LOOPER_MIN_ACTION_DURATION_MS,
      data.loopGapMs,
    );
    data.durationMs = data.timeline.durationMs;
    this.adapter.updateVisuals?.(looperState);
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
    data.recording = false;
    data.paused = false;
    for (const track of data.tracks) {
      track.resetRuntimeState();
    }
    this.adapter.updateVisuals?.(looperState);
  }

  startPlayback(looperState, now = performance.now()) {
    const data = looperState?.looperData;
    if (!data?.timeline?.hasRecording() || data.recording) {
      return;
    }

    this.adapter.ensureAudio?.();
    this.applier.clearLooper(looperState);
    data.playbackEngine.stop({
      onReleaseTrack: (trackId) => this.releaseTrackById(looperState, trackId),
    });

    data.playing = true;
    data.paused = false;
    data.lastPlaybackUpdateMs = now;
    data.playbackEngine.start(now);
    this.updatePlaybackForLooper(looperState, now);
    this.adapter.updateVisuals?.(looperState);
  }

  pausePlayback(looperState) {
    const data = looperState?.looperData;
    if (!data?.playing || data.paused) {
      return;
    }

    data.playbackEngine.pause({
      onReleaseTrack: (trackId) => this.releaseTrackById(looperState, trackId),
    });
    this.applier.clearLooper(looperState);
    data.playing = false;
    data.paused = true;
    for (const track of data.tracks) {
      track.isPlaying = false;
    }
    this.adapter.updateVisuals?.(looperState);
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
    data.playing = false;
    data.paused = false;
    data.lastPlaybackUpdateMs = 0;
    for (const track of data.tracks) {
      track.isPlaying = false;
    }
    this.adapter.updateVisuals?.(looperState);
  }

  updateRecordings(looperStates, now = performance.now()) {
    for (const looperState of looperStates) {
      const data = looperState.looperData;
      if (!data?.recording || !looperState.root?.visible) {
        continue;
      }

      for (const track of data.tracks) {
        this.recorder.updateTrack(
          data.timeline,
          track,
          now,
          (honkState) => this.adapter.captureAction?.(honkState) || null,
        );
      }
      this.adapter.updateVisuals?.(looperState);
    }
  }

  updatePlayback(looperStates, now = performance.now()) {
    for (const looperState of looperStates) {
      this.updatePlaybackForLooper(looperState, now);
    }
  }

  updatePlaybackForLooper(looperState, now = performance.now()) {
    const data = looperState?.looperData;
    if (!data?.playing || data.paused || !looperState.root?.visible) {
      return;
    }

    if (!data.timeline?.hasRecording()) {
      this.stopPlayback(looperState);
      return;
    }

    data.playbackEngine.update(now, data.timeline, data.speed, {
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
    });
  }

  updateAutomationAudio() {
    this.applier.updateAudio();
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

  connectTrackToHonk(looperState, trackIndex, honkState) {
    return this.connections.connect(looperState, trackIndex, honkState);
  }

  disconnectTrack(looperState, trackIndex) {
    const track = this.getTrack(looperState, trackIndex);
    if (looperState?.looperData?.recording && track) {
      this.recorder.releaseTrackActions(
        looperState.looperData.timeline,
        track,
        looperState.looperData.timeline.getElapsedMs(performance.now()),
      );
    }
    return this.connections.disconnect(looperState, trackIndex);
  }

  recordTrackDrumHit(looperState, track, drumType, now = performance.now()) {
    const data = looperState?.looperData;
    if (!data?.recording || !track || !drumType) {
      return false;
    }

    const elapsedMs = data.timeline.getElapsedMs(now);
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
    if (!data?.recording || !drumType) {
      return false;
    }

    const elapsedMs = data.timeline.getElapsedMs(now);
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

  clearRuntimeState(looperState) {
    const data = looperState?.looperData;
    if (!data) {
      return;
    }

    this.stopPlayback(looperState);
    data.recording = false;
    data.playing = false;
    data.paused = false;
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

    this.stopRecording(looperState);
    this.stopPlayback(looperState);
    for (const track of data.tracks) {
      if (track.wireMesh) {
        this.adapter.disposeWireMesh?.(track.wireMesh);
        track.wireMesh = null;
      }
    }
  }

  releaseHonk(honkState) {
    this.applier.clearHonk(honkState);
  }
}
