import {
  LOOPER_GESTURE_EVENT_EPSILONS,
  LOOPER_GESTURE_SAMPLE_INTERVAL_MS,
  LOOPER_SQUEEZE_GATE_CLOSE_THRESHOLD,
  LOOPER_SQUEEZE_GATE_OPEN_THRESHOLD,
} from "../../config/looper.js";
import { cloneActionState, createActionState, hasActionValue } from "./timeline/actionState.js";
import { LooperActionEventType } from "./timeline/LooperActionEvent.js";

const NUMERIC_FIELDS = ["squeeze", "bend", "earLeft", "earRight", "nose"];
const ALL_FIELDS = [...NUMERIC_FIELDS, "vowel"];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeActionState(source) {
  const action = createActionState();
  if (!source) return action;
  if (source.squeeze !== undefined) action.squeeze = clamp(source.squeeze, 0, 1);
  if (source.bend !== undefined) action.bend = clamp(source.bend, -1, 1);
  if (source.earLeft !== undefined) action.earLeft = clamp(source.earLeft, -1, 1);
  if (source.earRight !== undefined) action.earRight = clamp(source.earRight, -1, 1);
  if (source.nose !== undefined) action.nose = clamp(source.nose, 0, 1);
  if (source.vowel !== undefined) action.vowel = source.vowel || "neutral";
  return action;
}

export class LooperGestureRecorder {
  constructor({
    sampleIntervalMs = LOOPER_GESTURE_SAMPLE_INTERVAL_MS,
    epsilons = LOOPER_GESTURE_EVENT_EPSILONS,
  } = {}) {
    // Retained for API compatibility. Faithful capture records every supplied
    // input update instead of dropping local turns behind a time throttle.
    this.sampleIntervalMs = sampleIntervalMs;
    this.epsilons = { ...LOOPER_GESTURE_EVENT_EPSILONS, ...epsilons };
  }

  isMusicalOnset(action) {
    if (typeof action?.musicalOnset === "boolean") return action.musicalOnset;
    return Number(action?.squeeze || 0) > LOOPER_SQUEEZE_GATE_OPEN_THRESHOLD;
  }

  start(timeline, tracks, now, captureActionByHonkId, timing = null) {
    timeline.startRecording(now, timing);
    for (const track of tracks) {
      track.resetRecordingState();
      const captured = this.captureTrackAction(track, captureActionByHonkId);
      const baseline = normalizeActionState(captured);
      track.recorderState = this.createRecorderState(baseline, Boolean(captured));
      timeline.ensureTrack(track.trackId, {
        nodeId: track.nodeId,
        trackIndex: track.index,
      })?.setBaseline(baseline);
    }
  }

  createRecorderState(baseline, hasBaseline) {
    return {
      baseline,
      hasBaseline,
      lastObserved: cloneActionState(baseline),
      lastObservedAtMs: 0,
      activeFields: new Set(),
      recordedFields: new Set(),
      squeezeGateActive: false,
    };
  }

  updateTrack(timeline, track, now, captureActionByHonkId) {
    if (!timeline?.recording || !track) return;
    const elapsedMs = timeline.getElapsedMs(now);
    const captured = this.captureTrackAction(track, captureActionByHonkId);
    if (!captured) {
      this.releaseTrackActions(timeline, track, elapsedMs);
      return;
    }

    const action = normalizeActionState(captured);
    if (!track.recorderState) {
      track.recorderState = this.createRecorderState(action, true);
      timeline.ensureTrack(track.trackId, {
        nodeId: track.nodeId,
        trackIndex: track.index,
      })?.setBaseline(action);
    }
    const state = track.recorderState;
    if (!state.hasBaseline) {
      state.baseline = cloneActionState(action);
      state.lastObserved = cloneActionState(action);
      state.hasBaseline = true;
      timeline.ensureTrack(track.trackId, {
        nodeId: track.nodeId,
        trackIndex: track.index,
      })?.setBaseline(action);
    }

    const nextGateActive = this.resolveGateState(state, captured, action);
    let wroteEvent = false;
    if (nextGateActive !== state.squeezeGateActive) {
      const type = nextGateActive
        ? LooperActionEventType.SqueezeStart
        : LooperActionEventType.SqueezeEnd;
      timeline.addActionEvent(track.trackId, {
        nodeId: track.nodeId,
        trackIndex: track.index,
        type,
        timeMs: elapsedMs,
        value: nextGateActive ? (action.squeeze ?? 1) : 0,
        interpolation: "step",
        gateOnly: true,
        releaseOrigin: nextGateActive ? null : (captured.releaseOrigin || "controller"),
      });
      if (nextGateActive) timeline.markMusicalOnset(elapsedMs);
      state.squeezeGateActive = nextGateActive;
      this.activateField(state, "squeeze");
      wroteEvent = true;
    }

    for (const field of ALL_FIELDS) {
      if (action[field] === undefined) continue;
      if (
        !state.activeFields.has(field) &&
        (field !== "squeeze" || state.squeezeGateActive) &&
        this.fieldChangedFromBaseline(state, field, action[field])
      ) {
        this.activateField(state, field);
      }
    }

    const continuousValues = createActionState();
    let hasContinuousValues = false;
    let continuousChanged = false;
    for (const field of NUMERIC_FIELDS) {
      if (!state.activeFields.has(field) || action[field] === undefined) continue;
      continuousValues[field] = action[field];
      hasContinuousValues = true;
      if (action[field] !== state.lastObserved[field]) continuousChanged = true;
    }
    const hasSustainedGesture = NUMERIC_FIELDS.some((field) => (
      field !== "squeeze" &&
      state.activeFields.has(field) &&
      action[field] !== undefined &&
      action[field] !== state.baseline[field]
    ));
    if (hasContinuousValues && (state.squeezeGateActive || continuousChanged || hasSustainedGesture)) {
      timeline.addActionEvent(track.trackId, {
        nodeId: track.nodeId,
        trackIndex: track.index,
        type: LooperActionEventType.GestureSnapshot,
        timeMs: elapsedMs,
        values: continuousValues,
        interpolation: "linear",
        support: false,
      });
      wroteEvent = true;
    }

    if (state.activeFields.has("vowel") && action.vowel !== state.lastObserved.vowel) {
      timeline.addFieldEvent(track.trackId, "vowel", elapsedMs, action.vowel, {
        nodeId: track.nodeId,
        trackIndex: track.index,
        interpolation: "step",
      });
      wroteEvent = true;
    }

    state.lastObserved = cloneActionState(action);
    state.lastObservedAtMs = elapsedMs;
    if (wroteEvent) {
      track.isRecording = true;
      track.active = true;
    }
  }

  activateField(state, field) {
    if (state.activeFields.has(field)) return;
    state.activeFields.add(field);
    state.recordedFields.add(field);
  }

  fieldChangedFromBaseline(state, field, value) {
    const baseline = state.baseline[field];
    if (field === "vowel") return (value || "neutral") !== (baseline || "neutral");
    const epsilon = this.epsilons[field] ?? 0.015;
    const baselineValue = hasActionValue(state.baseline, field) ? baseline : 0;
    return Math.abs(value - baselineValue) > epsilon;
  }

  resolveGateState(state, captured, action) {
    if (typeof captured.gateActive === "boolean") return captured.gateActive;
    const value = action.squeeze || 0;
    return state.squeezeGateActive
      ? value > LOOPER_SQUEEZE_GATE_CLOSE_THRESHOLD
      : value > LOOPER_SQUEEZE_GATE_OPEN_THRESHOLD;
  }

  stop(timeline, tracks, now, minDurationMs, captureActionByHonkId = null, timing = null) {
    if (!timeline?.recording) return timeline?.hasRecording?.() || false;
    if (typeof captureActionByHonkId === "function") {
      for (const track of tracks) this.updateTrack(timeline, track, now, captureActionByHonkId);
    }
    const elapsedMs = timeline.getElapsedMs(now);
    for (const track of tracks) {
      this.releaseTrackActions(timeline, track, elapsedMs, {
        synthetic: true,
        preserveDuration: true,
      });
      track.isRecording = false;
    }
    const hasRecording = timeline.stopRecording(now, minDurationMs, timing);
    for (const track of tracks) track.active = Boolean(timeline.getTrack(track.trackId)?.active);
    return hasRecording;
  }

  releaseTrackActions(
    timeline,
    track,
    elapsedMs,
    { synthetic = false, preserveDuration = false } = {},
  ) {
    const state = track?.recorderState;
    if (!timeline || !track || !state || !state.squeezeGateActive) return;
    timeline.addActionEvent(track.trackId, {
      nodeId: track.nodeId,
      trackIndex: track.index,
      type: LooperActionEventType.SqueezeEnd,
      timeMs: elapsedMs,
      value: 0,
      interpolation: "step",
      synthetic,
      gateOnly: true,
      preserveDuration,
      releaseOrigin: "controller",
    });
    state.squeezeGateActive = false;
    state.recordedFields.add("squeeze");
    track.active = true;
  }

  captureTrackAction(track, captureActionByHonkId) {
    if (
      track?.connectedHonkId === null ||
      track?.connectedHonkId === undefined ||
      typeof captureActionByHonkId !== "function"
    ) return null;
    return captureActionByHonkId(track.connectedHonkId) || null;
  }
}
