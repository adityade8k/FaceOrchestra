import { copyActionState, createActionState } from "./timeline/actionState.js";

export class LooperTrack {
  constructor({
    index,
    trackId = `track-${index}`,
    nodeTarget = null,
    nodeId = null,
    connectedHonkId = null,
  } = {}) {
    this.index = index;
    this.trackId = trackId;
    this.nodeId = nodeId || this.trackId;
    this.connectedHonkId = connectedHonkId;

    // View-owned references are intentionally excluded from serialization.
    this.nodeTarget = nodeTarget;
    this.wireMesh = null;

    this.isRecording = false;
    this.isPlaying = false;
    this.active = false;
    this.recorderState = null;
    this.automationLayerId = null;
    this.automationHonkId = null;
    this.automationSnapshot = createActionState();
  }

  connect(honkId) {
    this.connectedHonkId = honkId;
  }

  disconnect() {
    const previousHonkId = this.connectedHonkId;
    this.connectedHonkId = null;
    return previousHonkId;
  }

  resetRecordingState() {
    this.isRecording = false;
    this.recorderState = null;
  }

  resetPlaybackState() {
    this.isPlaying = false;
    this.automationLayerId = null;
    this.automationHonkId = null;
    copyActionState(this.automationSnapshot, null);
  }

  resetRuntimeState() {
    this.resetRecordingState();
    this.resetPlaybackState();
    this.active = false;
  }

  toJSON() {
    return {
      trackId: this.trackId,
      index: this.index,
      nodeId: this.nodeId,
      connectedHonkId: this.connectedHonkId,
    };
  }
}
