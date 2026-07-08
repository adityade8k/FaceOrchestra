export class LooperConnectionManager {
  constructor({ applier, adapter = {} } = {}) {
    this.applier = applier;
    this.adapter = adapter;
  }

  connect(looperState, trackIndex, honkState) {
    const track = this.getTrack(looperState, trackIndex);
    if (!track || !this.adapter.isPlayableHonk?.(honkState)) {
      return null;
    }

    if (track.connectedHonkState && track.connectedHonkState !== honkState) {
      this.applier?.clearTrack(looperState, track);
    }

    track.connectedHonkState = honkState;
    this.adapter.updateWireForTrack?.(looperState, track);
    this.adapter.updateVisuals?.(looperState);
    return track;
  }

  disconnect(looperState, trackIndex) {
    const track = this.getTrack(looperState, trackIndex);
    if (!track) {
      return null;
    }

    this.applier?.clearTrack(looperState, track);
    track.connectedHonkState = null;
    track.isRecording = false;
    track.isPlaying = false;
    if (track.wireMesh) {
      this.adapter.disposeWireMesh?.(track.wireMesh);
      track.wireMesh = null;
    }
    this.adapter.updateVisuals?.(looperState);
    return track;
  }

  getTrack(looperState, trackIndex) {
    return looperState?.looperData?.tracks?.[trackIndex] || null;
  }
}
