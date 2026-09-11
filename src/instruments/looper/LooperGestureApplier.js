import { LOOPER_ACTION_RELEASE_FADE_SECONDS } from "../../config/audio.js";
import { HONK_RELEASE_ORIGINS } from "../../audio/honk/HonkReleaseProfile.js";
import { copyActionState, createActionState, resetActionState } from "./timeline/actionState.js";
import { LooperActionEventType } from "./timeline/LooperActionEvent.js";

const ACTION_SQUEEZE_THRESHOLD = 0.015;

export class LooperGestureApplier {
  constructor(adapter = {}) {
    this.adapter = adapter;
    this.appliedTracks = new Map();
    this.applyFrame = 0;
    this.scheduledVoices = new Map();
    this.scheduledGenerations = new Map();
    this.audioTargetsByLayer = new Map();
    this.scheduledVoiceSequence = 0;
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
          voiceId: this.getActionVoiceId(looperState, track, targetHonkId),
          snapshot: createActionState(),
          voiceActive: false,
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
      this.setAutomationLayer(targetHonkId, layerId, targetEntry.snapshot);
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
    this.cancelScheduledGenerations((scheduled) => scheduled.layerId === layerId);
    this.audioTargetsByLayer.delete(layerId);
    track.resetPlaybackState();
  }

  scheduleTrackEvent(
    looperState,
    track,
    trackTimeline,
    event,
    snapshot,
    { volume = 1, scheduledTime, noteKey = null, targetHonkIds = null } = {},
  ) {
    if (!looperState || !track || !Number.isFinite(scheduledTime)) return;
    const layerId = this.getLayerId(looperState, track);
    const isStart = event.type === LooperActionEventType.SqueezeStart;
    const isEnd = event.type === LooperActionEventType.SqueezeEnd;
    const resolvedNoteKey = noteKey || `${track.trackId}:legacy`;
    const eventTargets = targetHonkIds || (
      isStart
        ? this.getPlaybackTargetIds(track, track.connectedHonkId)
        : this.getGenerationTargetIds(layerId, resolvedNoteKey)
    );
    for (const honkId of eventTargets) {
      if (!this.isPlayableHonkId(honkId)) continue;
      const baseVoiceId = this.getActionVoiceId(looperState, track, honkId);
      const ownershipKey = this.getScheduledOwnershipKey(layerId, honkId, resolvedNoteKey);
      let scheduledVoice = this.scheduledVoices.get(ownershipKey);
      const scheduledSnapshot = createActionState();
      if (honkId === track.connectedHonkId) copyActionState(scheduledSnapshot, snapshot);
      else this.copyChordFollowerAction(scheduledSnapshot, snapshot);

      if (isEnd) {
        if (scheduledVoice && !Number.isFinite(scheduledVoice.releaseScheduledAt)) {
          this.adapter.releaseActionVoice?.(scheduledVoice.voiceId, honkId, {
            scheduledTime,
            origin: event.releaseOrigin || HONK_RELEASE_ORIGINS.controller,
          });
          scheduledVoice.releaseScheduledAt = scheduledTime;
          scheduledVoice.expiresAt = scheduledTime + 0.25;
        }
        continue;
      }
      if (isStart) {
        if (!scheduledVoice) {
          const voiceId = `${baseVoiceId}:scheduled-${++this.scheduledVoiceSequence}`;
          scheduledVoice = {
            voiceId,
            baseVoiceId,
            ownershipKey,
            noteKey: resolvedNoteKey,
            layerId,
            trackId: track.trackId,
            honkId,
            looperId: looperState.id,
            startsAt: scheduledTime,
          };
          this.adapter.startActionVoice?.(voiceId, honkId, { scheduledTime });
          this.scheduledVoices.set(ownershipKey, scheduledVoice);
          this.scheduledGenerations.set(voiceId, scheduledVoice);
        }
      }
      if (scheduledVoice) {
        this.adapter.updateActionVoiceByHonkId?.(
          scheduledVoice.voiceId,
          honkId,
          scheduledSnapshot,
          volume,
          { scheduledTime },
        );
      }
    }
  }

  clearLooper(looperState) {
    if (!looperState?.looperData) {
      return;
    }
    for (const track of looperState.looperData.tracks) {
      this.clearTrack(looperState, track);
    }
  }

  cancelScheduledAudio(looperState) {
    if (!looperState) return;
    this.cancelScheduledGenerations((scheduled) => scheduled.looperId === looperState.id);
  }

  cancelScheduledGenerations(predicate, options = {}) {
    for (const [voiceId, scheduled] of this.scheduledGenerations) {
      if (!predicate(scheduled)) continue;
      if (this.adapter.cancelActionVoice) {
        this.adapter.cancelActionVoice(voiceId, scheduled.honkId, {
          fadeSeconds: LOOPER_ACTION_RELEASE_FADE_SECONDS,
          ...options,
        });
      } else {
        this.adapter.releaseActionVoice?.(voiceId, scheduled.honkId, {
          fadeSeconds: LOOPER_ACTION_RELEASE_FADE_SECONDS,
          ...options,
        });
      }
      this.scheduledGenerations.delete(voiceId);
    }
    for (const [ownershipKey, scheduled] of this.scheduledVoices) {
      if (predicate(scheduled)) this.scheduledVoices.delete(ownershipKey);
    }
  }

  pruneScheduledAudio(audioNow) {
    for (const [voiceId, scheduled] of this.scheduledGenerations) {
      if (Number.isFinite(scheduled.expiresAt) && scheduled.expiresAt <= audioNow) {
        this.scheduledGenerations.delete(voiceId);
        this.scheduledVoices.delete(scheduled.ownershipKey);
      }
    }
  }

  initializeAudioTargets(looperState, track) {
    const layerId = this.getLayerId(looperState, track);
    this.audioTargetsByLayer.set(
      layerId,
      new Set(this.getPlaybackTargetIds(track, track.connectedHonkId)),
    );
  }

  reconcileAudioTargets(looperState, track) {
    const layerId = this.getLayerId(looperState, track);
    const desired = new Set(
      [...this.getPlaybackTargetIds(track, track.connectedHonkId)]
        .filter((honkId) => this.isPlayableHonkId(honkId)),
    );
    const previous = this.audioTargetsByLayer.get(layerId) || new Set();
    const owned = new Set(previous);
    for (const scheduled of this.scheduledGenerations.values()) {
      if (scheduled.layerId === layerId) owned.add(scheduled.honkId);
    }
    const departed = [...owned].filter((honkId) => !desired.has(honkId));
    const joined = [...desired].filter((honkId) => !previous.has(honkId));
    for (const honkId of departed) this.releaseAudioTarget(layerId, honkId);
    this.audioTargetsByLayer.set(layerId, desired);
    return { desired, departed, joined };
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
    this.cancelScheduledGenerations((scheduled) => scheduled.honkId === honkId);
    for (const targets of this.audioTargetsByLayer.values()) targets.delete(honkId);
  }

  updateAudio() {
    for (const entry of this.appliedTracks.values()) {
      for (const [honkId, targetEntry] of entry.targetEntries) {
        const { voiceId, snapshot } = targetEntry;
        if (!this.isPlayableHonkId(honkId)) {
          this.releaseTargetEntry(entry.layerId, targetEntry);
          entry.targetEntries.delete(honkId);
          continue;
        }

        const squeeze = snapshot.squeeze || 0;
        if (squeeze <= ACTION_SQUEEZE_THRESHOLD) {
          if (targetEntry.voiceActive) {
            this.releaseActionVoice(voiceId, honkId);
            targetEntry.voiceActive = false;
          }
          continue;
        }

        if (!targetEntry.voiceActive) {
          this.adapter.startActionVoice?.(voiceId, honkId);
          targetEntry.voiceActive = true;
        }
        this.updateActionVoice(voiceId, honkId, snapshot, entry.volume);
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
    const targetValues = this.adapter.getPlaybackTargetIds?.(track, connectedHonkId) || [connectedHonkId];

    const targetIds = new Set();
    for (const targetId of targetValues) {
      if (typeof targetId === "string" || typeof targetId === "number") {
        targetIds.add(targetId);
      }
    }
    return targetIds;
  }

  getActionVoiceId(looperState, track, honkId) {
    return this.adapter.getActionVoiceIdForHonkId?.(looperState, track, honkId) ||
      `${this.getLayerId(looperState, track)}:instrument-${honkId}:action`;
  }

  setAutomationLayer(honkId, layerId, snapshot) {
    this.adapter.setAutomationLayerByHonkId?.(honkId, layerId, snapshot);
  }

  clearAutomationLayer(honkId, layerId) {
    this.adapter.clearAutomationLayerByHonkId?.(honkId, layerId);
  }

  updateActionVoice(voiceId, honkId, snapshot, volume) {
    this.adapter.updateActionVoiceByHonkId?.(voiceId, honkId, snapshot, volume);
  }

  releaseActionVoice(voiceId, honkId) {
    this.adapter.releaseActionVoice?.(voiceId, honkId, {
      fadeSeconds: LOOPER_ACTION_RELEASE_FADE_SECONDS,
    });
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
    if (targetEntry?.voiceId && targetEntry.voiceActive) {
      this.releaseActionVoice(targetEntry.voiceId, targetEntry.honkId);
    }
    if (targetEntry) {
      targetEntry.voiceActive = false;
      this.cancelScheduledGenerations(
        (scheduled) => scheduled.layerId === layerId && scheduled.honkId === targetEntry.honkId,
      );
      this.audioTargetsByLayer.get(layerId)?.delete(targetEntry.honkId);
    }
  }

  releaseAudioTarget(layerId, honkId) {
    this.clearAutomationLayer(honkId, layerId);
    const entry = this.appliedTracks.get(layerId);
    const targetEntry = entry?.targetEntries.get(honkId);
    if (targetEntry?.voiceId && targetEntry.voiceActive) {
      this.releaseActionVoice(targetEntry.voiceId, honkId);
    }
    entry?.targetEntries.delete(honkId);
    this.cancelScheduledGenerations(
      (scheduled) => scheduled.layerId === layerId && scheduled.honkId === honkId,
    );
  }

  getGenerationTargetIds(layerId, noteKey) {
    const targetIds = new Set();
    for (const scheduled of this.scheduledGenerations.values()) {
      if (scheduled.layerId === layerId && scheduled.noteKey === noteKey) {
        targetIds.add(scheduled.honkId);
      }
    }
    return targetIds;
  }

  getScheduledOwnershipKey(layerId, honkId, noteKey) {
    return `${layerId}:target-${honkId}:note-${noteKey}`;
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
