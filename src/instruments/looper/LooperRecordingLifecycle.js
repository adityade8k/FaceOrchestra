import { BEAT_EQUALITY_EPSILON, hasBeatGrid } from "./looperBeatTiming.js";

import {
  LOOPER_GESTURE_EVENT_EPSILONS,
  LOOPER_GESTURE_SAMPLE_INTERVAL_MS,
  LOOPER_MAX_RECORDING_DURATION_MS,
  LOOPER_BEAT_DETECTION_SETTINGS,
  LOOPER_MIN_ACTION_DURATION_MS,
} from "../../config/looper.js";

import { LooperBeatDetector } from "./LooperBeatDetector.js";

import { LooperGestureRecorder } from "./LooperGestureRecorder.js";

import { LooperTimeline } from "./timeline/LooperTimeline.js";

const LOOPER_SELF_PERCUSSION_TRACK_ID = "looper-self-percussion";

export class LooperRecordingLifecycle {
  constructor(controller) {
    this.controller = controller;
    this.recorder = new LooperGestureRecorder({
      sampleIntervalMs: LOOPER_GESTURE_SAMPLE_INTERVAL_MS,
      epsilons: LOOPER_GESTURE_EVENT_EPSILONS,
    });
    this.beatDetector = new LooperBeatDetector(LOOPER_BEAT_DETECTION_SETTINGS);
  }
  startRecording(looperState, now = performance.now()) {
    const data = looperState?.looperData;
    if (!data) {
      return false;
    }

    const timing = this.controller.getTimingForLooper(looperState, now);
    if (!timing.active) return false;
    return this.armRecording(looperState, now, timing);
  }
  armRecording(looperState, now, timing) {
    const data = looperState.looperData;
    if (data.transport.recordArmed) return true;
    if (data.transport.recording) this.stopRecording(looperState, now);
    this.controller.stopPlayback(looperState);
    data.takeRevision++;
    data.armedAction = "record";
    data.armedAtMs = now;
    data.armedAfterBeatOrdinal = null;
    data.clockMetronomeId = timing.metronomeId;
    data.latchedRecordBeats = data.recordBeats;
    data.recordingWindow = null;
    data.recordingCompletion = null;
    data.transport.armRecord();
    this.controller.adapter.updateVisuals?.(looperState);
    return true;
  }
  beginRecording(looperState, now, timing = null) {
    const data = looperState.looperData;

    this.controller.stopPlayback(looperState);
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
      (honkId) => this.controller.captureActionByHonkId(honkId),
      timing,
    );
    if (hasBeatGrid(timing)) {
      const startBeat = Math.floor(timing.beatPosition + BEAT_EQUALITY_EPSILON);
      const beats = data.latchedRecordBeats;
      data.recordingWindow = {
        startBeat,
        endBeat: beats === 0 ? Infinity : startBeat + beats,
        beats,
        firstOnsetBeat: timing.beatPosition,
        firstOnsetMs: now,
        metronomeId: timing.metronomeId,
        sourceBeatIntervalMs: timing.beatIntervalMs,
        lastTiming: timing,
        lastTimingAtMs: now,
      };
      data.timeline.startedAtMs =
        now - Math.max(0, timing.beatPosition - startBeat) * timing.beatIntervalMs;
      data.timeline.recordingClock = (time) => {
        const phase = this.getRecordingTiming(looperState, time).beatPosition;
        // Nanosecond precision removes floating-point residue at beat equality.
        return Math.round((phase - startBeat) * timing.beatIntervalMs * 1e6) / 1e6;
      };
    }
    this.controller.adapter.updateVisuals?.(looperState);
    return true;
  }
  stopRecording(looperState, now = performance.now()) {
    const data = looperState?.looperData;
    if (data?.transport.recordArmed) {
      this.controller.cancelArmedStart(looperState);
      return false;
    }
    if (!data?.transport.recording) {
      return false;
    }

    const window = data.recordingWindow;
    const timing = this.getRecordingTiming(looperState, now);
    const automatic = Boolean(
      window && timing.beatPosition + BEAT_EQUALITY_EPSILON >= window.endBeat,
    );
    if (automatic || window?.beats === 0) {
      data.timeline.lengthMode = "fixed-window";
      data.timeline.fixedWindowBeats = automatic
        ? window.beats
        : Math.max(0, timing.beatPosition - window.startBeat);
    }
    data.takeRevision++;
    data.hasRecording = this.recorder.stop(
      data.timeline,
      data.tracks,
      now,
      LOOPER_MIN_ACTION_DURATION_MS,
      (honkId) => this.controller.captureActionByHonkId(honkId),
      null,
      {
        endpointMs: automatic ? window.beats * window.sourceBeatIntervalMs : null,
      },
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
    data.recordingCompletion = {
      automatic,
      beats:
        data.timeline.recordedDurationMs /
        (data.timeline.sourceBeatIntervalMs || data.timeline.beatIntervalMs || 1),
      endBeat: automatic ? window.endBeat : timing.beatPosition,
      observedAtMs: now,
    };
    if (automatic) this.controller.adapter.onAutomaticRecordingStop?.(looperState, now);
    this.controller.adapter.updateVisuals?.(looperState);
    return data.hasRecording;
  }
  clearRecording(looperState) {
    const data = looperState?.looperData;
    if (!data) {
      return;
    }

    this.controller.stopPlayback(looperState);
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
    this.controller.adapter.updateVisuals?.(looperState);
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
      if (!this.controller.getTimingForLooper(looperState, now).active) {
        this.stopRecording(looperState, now);
        continue;
      }
      if (this.finishRecordingIfDue(looperState, now)) continue;

      if (
        data.latchedRecordBeats !== 0 &&
        data.timeline.getElapsedMs(now) >= LOOPER_MAX_RECORDING_DURATION_MS
      ) {
        this.stopRecording(looperState, now);
        continue;
      }

      for (const track of data.tracks) {
        this.recorder.updateTrack(data.timeline, track, now, (honkId) =>
          this.controller.captureActionByHonkId(honkId),
        );
      }
      this.controller.adapter.updateVisuals?.(looperState);
    }
  }
  hasArmedTrackOnset(data) {
    return data.tracks.some((track) =>
      this.recorder.isMusicalOnset(this.controller.captureActionByHonkId(track.connectedHonkId)),
    );
  }
  beginArmedRecordingFromOnset(looperState, now) {
    const data = looperState?.looperData;
    if (!data?.transport.recordArmed) return false;
    const timing = this.controller.getTimingForLooper(looperState, now);
    if (!timing.active || !hasBeatGrid(timing)) return false;
    // The first sound chooses its preceding beat, retaining the onset offset.
    return this.beginRecording(looperState, now, timing);
  }
  finishRecordingIfDue(looper, now) {
    const data = looper?.looperData,
      window = data?.recordingWindow;
    if (!data?.transport.recording || !window) return false;
    if (this.getRecordingTiming(looper, now).beatPosition + BEAT_EQUALITY_EPSILON < window.endBeat)
      return false;
    this.stopRecording(looper, now);
    return true;
  }
  getRecordingTiming(looper, now) {
    const timing = this.controller.getTimingForLooper(looper, now),
      window = looper?.looperData?.recordingWindow;
    if (!window) return timing;
    // Disconnection's normal Stop runs after the cable is removed. Finalize
    // against the last connected clock, never an unrelated internal origin.
    if (timing.metronomeId !== window.metronomeId) {
      const previous = window.lastTiming;
      return {
        ...previous,
        beatPosition:
          previous.beatPosition + (now - window.lastTimingAtMs) / previous.beatIntervalMs,
      };
    }
    window.lastTiming = timing;
    window.lastTimingAtMs = now;
    return timing;
  }
  getRecordingProgress(looper, now = performance.now()) {
    const data = looper?.looperData;
    if (!data) return null;
    if (data.transport.recordArmed) return { state: "armed", beats: data.latchedRecordBeats };
    const window = data.recordingWindow;
    if (data.transport.recording && window) {
      const elapsedBeats = Math.max(
        0,
        this.getRecordingTiming(looper, now).beatPosition - window.startBeat,
      );
      return {
        state: "recording",
        startBeat: window.startBeat,
        endBeat: window.endBeat,
        beats: window.beats,
        elapsedBeats,
        manual: window.beats === 0,
        beat: Math.min(
          window.beats || Infinity,
          Math.floor(elapsedBeats + BEAT_EQUALITY_EPSILON) + 1,
        ),
        remainingBeats: window.beats === 0 ? null : Math.max(0, window.beats - elapsedBeats),
      };
    }
    return data.recordingCompletion ? { state: "complete", ...data.recordingCompletion } : null;
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
    this.controller.adapter.updateVisuals?.(looperState);
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

    this.controller.adapter.updateVisuals?.(looperState);
    return true;
  }
}
