import { LOOPER_CONTROL_DEFAULT_VALUES } from "../../config/looper.js";

import { LooperTimeline } from "./timeline/LooperTimeline.js";

export class LooperStateCodec {
  constructor(controller) {
    this.controller = controller;
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
      connections: this.controller.connections.serializeConnections(looperState),
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

    this.controller.clearRuntimeState(looperState);
    if (!preserveConnections) {
      for (const track of data.tracks) {
        if (track.connectedHonkId !== null && track.connectedHonkId !== undefined) {
          this.controller.connections.disconnect(looperState, track.index);
        }
      }
    }
    data.takeRevision++;
    data.timeline = LooperTimeline.fromJSON(serialized.timeline || {});
    data.hasRecording = data.timeline.hasRecording();
    data.durationMs = data.timeline.durationMs;
    this.syncTrackActivityFromTimeline(looperState);

    const controls = serialized.controls || {};
    this.controller.setControlValue(
      looperState,
      "recordLength",
      { 0: -1, 2: -0.5, 4: 0, 8: 0.5, 16: 1 }[controls.recordBeats] ?? 1,
    );
    this.controller.setControlValue(
      looperState,
      "volume",
      controls.volume ?? LOOPER_CONTROL_DEFAULT_VALUES.volume,
    );
    this.controller.setControlValue(
      looperState,
      "gap",
      controls.gap ?? LOOPER_CONTROL_DEFAULT_VALUES.gap,
    );

    if (restoreConnections) {
      this.restoreConnections(looperState, serialized.connections);
    }
    this.controller.adapter.updateVisuals?.(looperState);
    return true;
  }
  restoreConnections(looperState, serializedConnections = []) {
    return this.controller.connections.restoreConnections(looperState, serializedConnections);
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
}
