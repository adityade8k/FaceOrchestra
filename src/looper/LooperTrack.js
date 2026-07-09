import { createActionState, copyActionState } from "./LooperTimeline.js";

export class LooperTrack {
  constructor({ index, nodeTarget = null, nodeId = null } = {}) {
    this.index = index;
    this.trackId = `track-${index}`;
    this.nodeId = nodeId || this.trackId;
    this.nodeTarget = nodeTarget;
    this.connectedHonkState = null;
    this.wireMesh = null;
    this.isRecording = false;
    this.isPlaying = false;
    this.active = false;
    this.recorderState = null;
    this.automationLayerId = null;
    this.automationVoiceId = null;
    this.automationHonkState = null;
    this.automationSnapshot = createActionState();
  }

  resetRecordingState() {
    this.isRecording = false;
    this.recorderState = null;
  }

  resetPlaybackState() {
    this.isPlaying = false;
    this.automationLayerId = null;
    this.automationVoiceId = null;
    this.automationHonkState = null;
    copyActionState(this.automationSnapshot, null);
  }

  resetRuntimeState() {
    this.resetRecordingState();
    this.resetPlaybackState();
    this.active = false;
  }
}
