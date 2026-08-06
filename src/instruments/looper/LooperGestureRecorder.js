import {
  cloneActionState,
  createActionState,
  hasActionValue,
} from "./timeline/actionState.js";
import { LooperActionEventType } from "./timeline/LooperActionEvent.js";

const DEFAULT_EPSILONS = {
  squeeze: 0.018,
  bend: 0.02,
  earLeft: 0.015,
  earRight: 0.015,
  nose: 0.015,
};

const MORPH_FIELDS = ["earLeft", "earRight", "nose", "vowel"];
const CONTINUOUS_FIELDS = ["squeeze", "bend"];
const SQUEEZE_GATE_EPSILON = 0.025;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeActionState(source) {
  const action = createActionState();
  if (!source) {
    return action;
  }
  if (source.squeeze !== undefined) {
    action.squeeze = clamp(source.squeeze, 0, 1);
  }
  if (source.bend !== undefined) {
    action.bend = clamp(source.bend, -1, 1);
  }
  if (source.earLeft !== undefined) {
    action.earLeft = clamp(source.earLeft, -1, 1);
  }
  if (source.earRight !== undefined) {
    action.earRight = clamp(source.earRight, -1, 1);
  }
  if (source.nose !== undefined) {
    action.nose = clamp(source.nose, 0, 1);
  }
  if (source.vowel !== undefined) {
    action.vowel = source.vowel || "neutral";
  }
  return action;
}

export class LooperGestureRecorder {
  constructor({ sampleIntervalMs = 33, epsilons = DEFAULT_EPSILONS } = {}) {
    this.sampleIntervalMs = sampleIntervalMs;
    this.epsilons = { ...DEFAULT_EPSILONS, ...epsilons };
  }

  isMusicalOnset(action) {
    if (typeof action?.musicalOnset === "boolean") return action.musicalOnset;
    return Number(action?.squeeze || 0) > SQUEEZE_GATE_EPSILON;
  }

  start(timeline, tracks, now, captureActionByHonkId, timing = null) {
    timeline.startRecording(now, timing);
    for (const track of tracks) {
      track.resetRecordingState();
      const captured = this.captureTrackAction(track, captureActionByHonkId);
      const baseline = normalizeActionState(captured);
      track.recorderState = {
        baseline,
        hasBaseline: Boolean(captured),
        lastRecorded: createActionState(),
        recordedFields: new Set(),
        lastSampleAtMs: -Infinity,
      };
      const trackTimeline = timeline.ensureTrack(track.trackId, {
        nodeId: track.nodeId,
        trackIndex: track.index,
      });
      trackTimeline?.setBaseline(baseline);
    }
  }

  updateTrack(timeline, track, now, captureActionByHonkId, { force = false } = {}) {
    if (!timeline?.recording || !track) {
      return;
    }

    const elapsedMs = timeline.getElapsedMs(now);
    const captured = this.captureTrackAction(track, captureActionByHonkId);
    if (!captured) {
      this.releaseTrackActions(timeline, track, elapsedMs);
      return;
    }

    if (!track.recorderState) {
      track.recorderState = {
        baseline: normalizeActionState(captured),
        hasBaseline: true,
        lastRecorded: createActionState(),
        recordedFields: new Set(),
        lastSampleAtMs: -Infinity,
      };
    }

    const action = normalizeActionState(captured);
    if (!track.recorderState.hasBaseline) {
      track.recorderState.baseline = cloneActionState(action);
      track.recorderState.hasBaseline = true;
      const trackTimeline = timeline.ensureTrack(track.trackId, {
        nodeId: track.nodeId,
        trackIndex: track.index,
      });
      trackTimeline?.setBaseline(action);
    }

    const forceGate = this.hasSqueezeGateTransition(track.recorderState, action);
    if (!force && !forceGate && elapsedMs - track.recorderState.lastSampleAtMs < this.sampleIntervalMs) {
      return;
    }

    let wroteEvent = false;
    for (const field of CONTINUOUS_FIELDS) {
      if (this.shouldRecordContinuousField(track.recorderState, field, action[field])) {
        this.addContinuousFieldEvent(timeline, track, field, elapsedMs, action[field]);
        track.recorderState.lastRecorded[field] = action[field];
        track.recorderState.recordedFields.add(field);
        wroteEvent = true;
      }
    }

    for (const field of MORPH_FIELDS) {
      if (this.shouldRecordMorphField(track.recorderState, field, action[field])) {
        timeline.addFieldEvent(track.trackId, field, elapsedMs, action[field], {
          nodeId: track.nodeId,
          trackIndex: track.index,
          interpolation: field === "vowel" ? "step" : "linear",
        });
        track.recorderState.lastRecorded[field] = action[field];
        track.recorderState.recordedFields.add(field);
        wroteEvent = true;
      }
    }

    if (wroteEvent) {
      track.recorderState.lastSampleAtMs = elapsedMs;
      track.isRecording = true;
      track.active = true;
    }
  }

  stop(timeline, tracks, now, minDurationMs, captureActionByHonkId = null, timing = null) {
    if (!timeline?.recording) {
      return timeline?.hasRecording?.() || false;
    }

    if (typeof captureActionByHonkId === "function") {
      for (const track of tracks) {
        this.updateTrack(timeline, track, now, captureActionByHonkId, { force: true });
      }
    }

    const elapsedMs = timeline.getElapsedMs(now);
    for (const track of tracks) {
      this.releaseTrackActions(timeline, track, elapsedMs);
      track.isRecording = false;
    }

    const hasRecording = timeline.stopRecording(now, minDurationMs, timing);
    for (const track of tracks) {
      const trackTimeline = timeline.getTrack(track.trackId);
      track.active = Boolean(trackTimeline?.active);
    }
    return hasRecording;
  }

  releaseTrackActions(timeline, track, elapsedMs) {
    const state = track?.recorderState;
    if (!timeline || !track || !state) {
      return;
    }

    if ((state.lastRecorded.squeeze || 0) > SQUEEZE_GATE_EPSILON) {
      timeline.addActionEvent(track.trackId, {
        nodeId: track.nodeId,
        trackIndex: track.index,
        type: LooperActionEventType.SqueezeEnd,
        timeMs: elapsedMs,
        value: 0,
        interpolation: "linear",
      });
      state.lastRecorded.squeeze = 0;
      state.recordedFields.add("squeeze");
      track.active = true;
    }

    if (Math.abs(state.lastRecorded.bend || 0) > this.epsilons.bend) {
      timeline.addFieldEvent(track.trackId, "bend", elapsedMs, 0, {
        nodeId: track.nodeId,
        trackIndex: track.index,
        interpolation: "linear",
      });
      state.lastRecorded.bend = 0;
      state.recordedFields.add("bend");
      track.active = true;
    }
  }

  hasSqueezeGateTransition(state, action) {
    const previous = state.recordedFields.has("squeeze") ? state.lastRecorded.squeeze || 0 : 0;
    const next = action.squeeze || 0;
    return (
      (previous <= SQUEEZE_GATE_EPSILON && next > SQUEEZE_GATE_EPSILON) ||
      (previous > SQUEEZE_GATE_EPSILON && next <= SQUEEZE_GATE_EPSILON)
    );
  }

  shouldRecordContinuousField(state, field, value) {
    if (value === undefined) {
      return false;
    }

    const neutral = 0;
    const epsilon = field === "squeeze" ? this.epsilons.squeeze : this.epsilons.bend;
    const previous = state.recordedFields.has(field) ? state.lastRecorded[field] || 0 : neutral;
    if (!state.recordedFields.has(field) && Math.abs(value - neutral) <= epsilon) {
      return false;
    }
    return Math.abs(value - previous) > epsilon;
  }

  shouldRecordMorphField(state, field, value) {
    if (value === undefined) {
      return false;
    }

    const baseline = state.baseline[field];
    const hasRecorded = state.recordedFields.has(field);
    if (field === "vowel") {
      const normalized = value || "neutral";
      const baselineValue = baseline || "neutral";
      const previous = hasRecorded ? state.lastRecorded[field] || "neutral" : baselineValue;
      return normalized !== previous && (hasRecorded || normalized !== baselineValue);
    }

    const epsilon = this.epsilons[field] ?? 0.015;
    const baselineValue = hasActionValue(state.baseline, field) ? baseline : 0;
    const previous = hasRecorded ? state.lastRecorded[field] : baselineValue;
    if (!hasRecorded && Math.abs(value - baselineValue) <= epsilon) {
      return false;
    }
    return Math.abs(value - previous) > epsilon;
  }

  addContinuousFieldEvent(timeline, track, field, elapsedMs, value) {
    if (field === "squeeze") {
      const previous = track.recorderState.recordedFields.has("squeeze")
        ? track.recorderState.lastRecorded.squeeze || 0
        : 0;
      const type = previous <= SQUEEZE_GATE_EPSILON && value > SQUEEZE_GATE_EPSILON
        ? LooperActionEventType.SqueezeStart
        : value <= SQUEEZE_GATE_EPSILON
          ? LooperActionEventType.SqueezeEnd
          : LooperActionEventType.Squeeze;
      timeline.addActionEvent(track.trackId, {
        nodeId: track.nodeId,
        trackIndex: track.index,
        type,
        timeMs: elapsedMs,
        value,
        interpolation: "linear",
      });
      if (type === LooperActionEventType.SqueezeStart) {
        timeline.markMusicalOnset(elapsedMs);
      }
      return;
    }

    timeline.addFieldEvent(track.trackId, field, elapsedMs, value, {
      nodeId: track.nodeId,
      trackIndex: track.index,
      interpolation: "linear",
    });
  }

  captureTrackAction(track, captureActionByHonkId) {
    if (
      track?.connectedHonkId === null ||
      track?.connectedHonkId === undefined ||
      typeof captureActionByHonkId !== "function"
    ) {
      return null;
    }
    return captureActionByHonkId(track.connectedHonkId) || null;
  }
}
