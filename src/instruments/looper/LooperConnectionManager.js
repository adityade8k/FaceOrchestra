export class LooperConnectionManager {
  constructor({ applier, adapter = {} } = {}) {
    this.applier = applier;
    this.adapter = adapter;
  }

  connect(looperState, trackIndexOrId, honkId) {
    const track = this.getTrack(looperState, trackIndexOrId);
    if (!track || honkId === null || honkId === undefined || !this.isPlayableHonkId(honkId)) {
      return null;
    }

    if (track.connectedHonkId !== null && track.connectedHonkId !== honkId) {
      this.applier?.clearTrack(looperState, track);
    }

    track.connect(honkId);
    this.adapter.updateWireForTrack?.(looperState, track);
    this.adapter.updateVisuals?.(looperState);
    return track;
  }

  disconnect(looperState, trackIndexOrId) {
    const track = this.getTrack(looperState, trackIndexOrId);
    if (!track) {
      return null;
    }

    this.applier?.clearTrack(looperState, track);
    track.disconnect();
    track.isRecording = false;
    track.isPlaying = false;
    if (track.wireMesh) {
      this.adapter.disposeWireMesh?.(track.wireMesh);
      track.wireMesh = null;
    }
    this.adapter.updateVisuals?.(looperState);
    return track;
  }

  disconnectHonk(looperState, honkId) {
    const disconnectedTracks = [];
    for (const track of looperState?.looperData?.tracks || []) {
      if (track.connectedHonkId !== honkId) {
        continue;
      }
      const disconnected = this.disconnect(looperState, track.index);
      if (disconnected) {
        disconnectedTracks.push(disconnected);
      }
    }
    return disconnectedTracks;
  }

  serializeConnections(looperState) {
    const connections = [];
    for (const track of looperState?.looperData?.tracks || []) {
      if (track.connectedHonkId === null || track.connectedHonkId === undefined) {
        continue;
      }
      connections.push({
        trackId: track.trackId,
        honkId: track.connectedHonkId,
      });
    }
    return connections;
  }

  restoreConnections(looperState, serializedConnections = []) {
    const restored = [];
    for (const connection of serializedConnections) {
      const track = connection?.trackId
        ? this.getTrackById(looperState, connection.trackId)
        : this.getTrack(looperState, connection?.trackIndex);
      if (!track) {
        continue;
      }
      const connected = this.connect(looperState, track.index, connection.honkId);
      if (connected) {
        restored.push(connected);
      }
    }
    return restored;
  }

  getTrack(looperState, trackIndexOrId) {
    if (typeof trackIndexOrId === "string") {
      return this.getTrackById(looperState, trackIndexOrId);
    }
    return looperState?.looperData?.tracks?.[trackIndexOrId] || null;
  }

  getTrackById(looperState, trackId) {
    return looperState?.looperData?.tracks?.find((track) => track.trackId === trackId) || null;
  }

  isPlayableHonkId(honkId) {
    if (this.adapter.isPlayableHonkId) {
      return Boolean(this.adapter.isPlayableHonkId(honkId));
    }
    const honk = this.adapter.resolveHonk?.(honkId) || null;
    return Boolean(honk && (typeof honk.isPlayable !== "function" || honk.isPlayable()));
  }
}
