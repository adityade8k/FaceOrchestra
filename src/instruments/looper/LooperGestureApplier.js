import { copyActionState, createActionState, resetActionState } from "./timeline/actionState.js";

const ACTION_SQUEEZE_THRESHOLD = 0.015;

export class LooperGestureApplier {
  constructor(adapter = {}) {
    this.adapter = adapter;
    this.appliedTracks = new Map();
    this.applyFrame = 0;
    this.fallbackTargetIds = [null];
  }

  applyTrackSnapshot(looperState, track, snapshot, { volume = 1 } = {}) {
    if (!looperState || !track) {
      return;
    }

    const connectedHonkId = track.connectedHonkId;
    const layerId = this.getLayerId(looperState, track);
    const previous = this.appliedTracks.get(layerId);

    if (previous && previous.connectedHonkId !== connectedHonkId) {
      this.clearTrack(looperState, track);
    }

    if (!this.isPlayableHonkId(connectedHonkId)) {
      if (previous) {
        this.clearTrack(looperState, track);
      }
      copyActionState(track.automationSnapshot, snapshot);
      track.automationHonkId = null;
      track.automationLayerId = layerId;
      track.isPlaying = this.snapshotHasMotion(snapshot);
      return;
    }

    copyActionState(track.automationSnapshot, snapshot);
    track.automationLayerId = layerId;
    track.automationHonkId = connectedHonkId;
    track.isPlaying = this.snapshotHasMotion(snapshot);

    let entry = this.appliedTracks.get(layerId);
    if (!entry) {
      entry = {
        connectedHonkId,
        layerId,
        targetEntries: new Map(),
      };
      this.appliedTracks.set(layerId, entry);
    }
    entry.connectedHonkId = connectedHonkId;
    entry.volume = volume;

    this.applyFrame += 1;
    for (const targetHonkId of this.getPlaybackTargetIds(track, connectedHonkId)) {
      if (!this.isPlayableHonkId(targetHonkId)) {
        continue;
      }

      let targetEntry = entry.targetEntries.get(targetHonkId);
      if (!targetEntry) {
        targetEntry = {
          honkId: targetHonkId,
          snapshot: createActionState(),
          seenFrame: 0,
        };
        entry.targetEntries.set(targetHonkId, targetEntry);
      }

      targetEntry.honkId = targetHonkId;
      targetEntry.seenFrame = this.applyFrame;
      if (targetHonkId === connectedHonkId) {
        copyActionState(targetEntry.snapshot, snapshot);
      } else {
        this.copyChordFollowerAction(targetEntry.snapshot, snapshot);
      }
      this.setAutomationLayer(targetHonkId, layerId, targetEntry.snapshot, volume);
    }

    for (const [targetHonkId, targetEntry] of entry.targetEntries) {
      if (targetEntry.seenFrame === this.applyFrame) {
        continue;
      }
      this.releaseTargetEntry(layerId, targetEntry);
      entry.targetEntries.delete(targetHonkId);
    }
  }

  clearTrack(looperState, track) {
    if (!looperState || !track) {
      return;
    }

    const layerId = this.getLayerId(looperState, track);
    const entry = this.appliedTracks.get(layerId);
    if (entry) {
      for (const targetEntry of entry.targetEntries.values()) {
        this.releaseTargetEntry(layerId, targetEntry);
      }
    } else if (track.automationHonkId !== null && track.automationHonkId !== undefined) {
      this.clearAutomationLayer(track.automationHonkId, layerId);
    }

    this.appliedTracks.delete(layerId);
    track.resetPlaybackState();
  }

  clearLooper(looperState) {
    if (!looperState?.looperData) {
      return;
    }
    for (const track of looperState.looperData.tracks) {
      this.clearTrack(looperState, track);
    }
  }

  clearHonk(honkId) {
    if (honkId === null || honkId === undefined) {
      return;
    }
    for (const entry of this.appliedTracks.values()) {
      const targetEntry = entry.targetEntries.get(honkId);
      if (!targetEntry) {
        continue;
      }
      this.releaseTargetEntry(entry.layerId, targetEntry);
      entry.targetEntries.delete(honkId);
    }
  }

  prepareLoopBoundary(looperState) {
    const prefix = `looper-${looperState?.id}:`;
    for (const entry of this.appliedTracks.values()) {
      if (!entry.layerId.startsWith(prefix)) continue;
      for (const targetEntry of entry.targetEntries.values()) {
        if ((targetEntry.snapshot.squeeze || 0) <= ACTION_SQUEEZE_THRESHOLD) continue;
        this.adapter.requestAudioRetriggerByHonkId?.(targetEntry.honkId);
      }
    }
  }

  getLayerId(looperState, track) {
    return this.adapter.getAutomationLayerId?.(looperState, track) ||
      `looper-${looperState.id}:track-${track.index}`;
  }

  resolveHonk(honkId) {
    return this.adapter.resolveHonk?.(honkId) || null;
  }

  isPlayableHonkId(honkId) {
    if (honkId === null || honkId === undefined) {
      return false;
    }
    if (this.adapter.isPlayableHonkId) {
      return Boolean(this.adapter.isPlayableHonkId(honkId));
    }
    const honk = this.resolveHonk(honkId);
    return Boolean(honk && (typeof honk.isPlayable !== "function" || honk.isPlayable()));
  }

  getPlaybackTargetIds(track, connectedHonkId) {
    const targetValues = this.adapter.getPlaybackTargetIds?.(track, connectedHonkId);
    if (targetValues) return targetValues;
    this.fallbackTargetIds[0] = connectedHonkId;
    return this.fallbackTargetIds;
  }

  setAutomationLayer(honkId, layerId, snapshot, gain = 1) {
    this.adapter.setAutomationLayerByHonkId?.(honkId, layerId, snapshot, gain);
  }

  clearAutomationLayer(honkId, layerId) {
    this.adapter.clearAutomationLayerByHonkId?.(honkId, layerId);
  }

  copyChordFollowerAction(target, source) {
    resetActionState(target);
    if (!source) {
      return target;
    }
    if (source.squeeze !== undefined) {
      target.squeeze = source.squeeze;
    }
    if (source.bend !== undefined) {
      target.bend = source.bend;
    }
    return target;
  }

  releaseTargetEntry(layerId, targetEntry) {
    if (targetEntry?.honkId !== null && targetEntry?.honkId !== undefined) {
      this.clearAutomationLayer(targetEntry.honkId, layerId);
    }
  }

  snapshotHasMotion(snapshot) {
    return (
      (snapshot?.squeeze || 0) > ACTION_SQUEEZE_THRESHOLD ||
      Math.abs(snapshot?.bend || 0) > 0.01 ||
      snapshot?.earLeft !== undefined ||
      snapshot?.earRight !== undefined ||
      snapshot?.nose !== undefined ||
      snapshot?.vowel !== undefined
    );
  }
}
