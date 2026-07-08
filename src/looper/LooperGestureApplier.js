import { copyActionState, createActionState, resetActionState } from "./LooperTimeline.js";

const ACTION_SQUEEZE_THRESHOLD = 0.015;

export class LooperGestureApplier {
  constructor(adapter = {}) {
    this.adapter = adapter;
    this.appliedTracks = new Map();
    this.applyFrame = 0;
  }

  applyTrackSnapshot(looperState, track, snapshot, { volume = 1 } = {}) {
    if (!looperState || !track) {
      return;
    }

    const honkState = this.adapter.getConnectedHonk?.(track) || null;
    const layerId = this.getLayerId(looperState, track);
    const previous = this.appliedTracks.get(layerId);

    if (previous && previous.connectedHonkState !== honkState) {
      this.clearTrack(looperState, track);
    }

    if (!this.adapter.isPlayableHonk?.(honkState)) {
      if (previous) {
        this.clearTrack(looperState, track);
      }
      copyActionState(track.automationSnapshot, snapshot);
      track.automationHonkState = null;
      track.automationLayerId = layerId;
      track.isPlaying = this.snapshotHasMotion(snapshot);
      return;
    }

    copyActionState(track.automationSnapshot, snapshot);
    track.automationLayerId = layerId;
    track.automationHonkState = honkState;
    track.isPlaying = this.snapshotHasMotion(snapshot);

    let entry = this.appliedTracks.get(layerId);
    if (!entry) {
      entry = {
        looperState,
        track,
        connectedHonkState: honkState,
        layerId,
        targetEntries: new Map(),
      };
      this.appliedTracks.set(layerId, entry);
    }
    entry.connectedHonkState = honkState;
    entry.volume = volume;

    this.applyFrame += 1;
    const targets = this.adapter.getPlaybackTargets?.(track, honkState) || [honkState];
    for (const targetState of targets) {
      if (!this.adapter.isPlayableHonk?.(targetState)) {
        continue;
      }

      const targetKey = this.getTargetKey(targetState);
      let targetEntry = entry.targetEntries.get(targetKey);
      if (!targetEntry) {
        targetEntry = {
          honkState: targetState,
          voiceId: this.adapter.getActionVoiceId?.(looperState, track, targetState) || `${layerId}:${targetKey}`,
          snapshot: createActionState(),
          voiceActive: false,
          seenFrame: 0,
        };
        entry.targetEntries.set(targetKey, targetEntry);
      }

      targetEntry.honkState = targetState;
      targetEntry.seenFrame = this.applyFrame;
      if (targetState === honkState) {
        copyActionState(targetEntry.snapshot, snapshot);
      } else {
        this.copyChordFollowerAction(targetEntry.snapshot, snapshot);
      }
      this.adapter.setAutomationLayer?.(targetState, layerId, targetEntry.snapshot);
    }

    for (const [targetKey, targetEntry] of entry.targetEntries) {
      if (targetEntry.seenFrame === this.applyFrame) {
        continue;
      }
      this.releaseTargetEntry(layerId, targetEntry);
      entry.targetEntries.delete(targetKey);
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
    } else if (track.automationHonkState || track.automationVoiceId) {
      this.releaseTargetEntry(layerId, {
        honkState: track.automationHonkState,
        voiceId: track.automationVoiceId,
      });
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

  clearHonk(honkState) {
    for (const entry of this.appliedTracks.values()) {
      for (const [targetKey, targetEntry] of entry.targetEntries) {
        if (targetEntry.honkState !== honkState) {
          continue;
        }
        this.releaseTargetEntry(entry.layerId, targetEntry);
        entry.targetEntries.delete(targetKey);
      }
    }
  }

  updateAudio() {
    for (const entry of this.appliedTracks.values()) {
      for (const [targetKey, targetEntry] of entry.targetEntries) {
        const { honkState, voiceId, snapshot } = targetEntry;
        if (!this.adapter.isPlayableHonk?.(honkState)) {
          this.releaseTargetEntry(entry.layerId, targetEntry);
          entry.targetEntries.delete(targetKey);
          continue;
        }

        const squeeze = snapshot.squeeze || 0;
        if (squeeze <= ACTION_SQUEEZE_THRESHOLD) {
          if (targetEntry.voiceActive) {
            this.adapter.releaseActionVoice?.(voiceId);
            targetEntry.voiceActive = false;
          }
          continue;
        }

        if (!targetEntry.voiceActive) {
          this.adapter.startActionVoice?.(voiceId);
          targetEntry.voiceActive = true;
        }
        this.adapter.updateActionVoice?.(voiceId, honkState, snapshot, entry.volume);
      }
    }
  }

  getLayerId(looperState, track) {
    return this.adapter.getAutomationLayerId?.(looperState, track) ||
      `looper-${looperState.id}:track-${track.index}`;
  }

  getTargetKey(honkState) {
    return this.adapter.getHonkTargetId?.(honkState) || honkState?.id || honkState;
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
    if (targetEntry?.honkState) {
      this.adapter.clearAutomationLayer?.(targetEntry.honkState, layerId);
    }
    if (targetEntry?.voiceId) {
      this.adapter.releaseActionVoice?.(targetEntry.voiceId);
    }
    if (targetEntry) {
      targetEntry.voiceActive = false;
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
