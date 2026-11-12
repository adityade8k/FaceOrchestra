import { hasBeatGrid } from "./looperBeatTiming.js";

import { LooperActionEventType } from "./timeline/LooperActionEvent.js";
import { createActionState } from "./timeline/actionState.js";
const AUDIO_SCHEDULER_INTERVAL_MS = 25;
const AUDIO_LOOKAHEAD_MS = 120;
const AUDIO_MAX_LATE_MS = 80;

export class LooperAudioScheduler {
  prepareArmedAudio(looper, timing, now) {
    const data = looper.looperData,
      pending = data.pendingLaunch;
    if (!pending || pending.prepared) return;
    const boundaryMs = now + (pending.targetBeat - timing.beatPosition) * timing.beatIntervalMs;
    data.audioScheduling.audioAnchor = pending.audioAnchor;
    const audioNow = this.getSchedulingAudioTime(looper, now);
    const scheduledTime = Number.isFinite(audioNow)
      ? audioNow + Math.max(boundaryMs - now, 0) / 1000
      : undefined;
    this.controller.applier.cancelScheduledAudio(looper, { scheduledTime });
    this.controller.adapter.cancelLooperPercussion?.(looper.id, { scheduledTime });
    data.playbackGeneration++;
    pending.prepared = true;
    pending.audioPreparedAtMs = now;
    pending.audioOriginTime = Number.isFinite(audioNow)
      ? audioNow + (boundaryMs - now) / 1000
      : null;
    data.audioScheduling.originBeat = pending.targetBeat;
    data.audioScheduling.startWallMs = boundaryMs;
    data.audioScheduling.startSourceMs = pending.resumeSourceMs;
    data.audioScheduling.scheduledThroughSourceMs = pending.resumeSourceMs;
    data.audioScheduling.includeStart = true;
    data.audioScheduling.percussionTimes = [];
    data.playbackReferenceBeatIntervalMs = this.getSourceBeatInterval(data.timeline);
    data.audioScheduling.lastRate = this.getPlaybackRate(looper, now);
    const lateSource = this.getAbsoluteSourcePosition(looper, now);
    if (lateSource > pending.resumeSourceMs + 1e-6) {
      data.audioScheduling.scheduledThroughSourceMs = lateSource;
      data.audioScheduling.includeStart = false;
      if (Number.isFinite(audioNow))
        this.reconcileScheduledAudioAtSource(looper, lateSource, audioNow);
    } else if (pending.resumeSourceMs > 0 && Number.isFinite(scheduledTime)) {
      this.reconcileScheduledAudioAtSource(looper, pending.resumeSourceMs, scheduledTime);
    }
    data.timeline.forEachActiveTrack((t) => {
      const track = this.controller.getTrack(looper, t.trackIndex);
      if (track) this.controller.applier.initializeAudioTargets(looper, track);
    });
  }
  createState() {
    return {
      timer: null,
      startWallMs: 0,
      startSourceMs: 0,
      scheduledThroughSourceMs: 0,
      includeStart: true,
      lastRate: 1,
    };
  }
  constructor(controller) {
    this.controller = controller;
  }
  startAudioScheduler(looper, now) {
    const scheduling = looper.looperData.audioScheduling;
    if (typeof this.controller.adapter.getAudioCurrentTime !== "function") return;
    if (scheduling.timer === null) {
      scheduling.timer =
        globalThis.setInterval?.(
          () => this.schedulePlaybackAudioForLooper(looper, performance.now()),
          AUDIO_SCHEDULER_INTERVAL_MS,
        ) || null;
      scheduling.timer?.unref?.();
    }
    this.schedulePlaybackAudioForLooper(looper, now);
  }
  stopAudioScheduler(looperState, { release = true } = {}) {
    const scheduling = looperState?.looperData?.audioScheduling;
    if (!scheduling) return;
    if (scheduling.timer !== null) globalThis.clearInterval?.(scheduling.timer);
    scheduling.timer = null;
    if (release) {
      this.controller.applier.cancelScheduledAudio?.(looperState);
      this.controller.adapter.cancelLooperPercussion?.(looperState.id);
    }
  }
  getSchedulingAudioTime(looper, now) {
    const anchor = looper.looperData.audioScheduling.audioAnchor;
    return Number.isFinite(anchor?.audioSeconds)
      ? anchor.audioSeconds + (now - anchor.wallMs) / 1000
      : this.controller.adapter.getAudioCurrentTime?.();
  }
  getSourceBeatInterval(timeline) {
    return (
      timeline.sourceBeatIntervalMs ||
      (timeline.timingMode === "metronome" ? timeline.beatIntervalMs : 0)
    );
  }
  getPlaybackRate(looper, now) {
    const interval = this.getSourceBeatInterval(looper.looperData.timeline);
    const timing = this.controller.getTimingForLooper(looper, now);
    return interval > 0 && timing.beatIntervalMs > 0 ? interval / timing.beatIntervalMs : 1;
  }
  getAbsoluteSourcePosition(looper, now) {
    const data = looper.looperData,
      timing = this.controller.getTimingForLooper(looper, now),
      scheduling = data.audioScheduling;
    const interval = this.getSourceBeatInterval(data.timeline);
    if (interval > 0 && hasBeatGrid(timing) && Number.isFinite(scheduling.originBeat)) {
      return (timing.beatPosition - scheduling.originBeat) * interval + scheduling.startSourceMs;
    }
    // Legacy takes without trustworthy source tempo retain their millisecond timing.
    return scheduling.startSourceMs + now - scheduling.startWallMs;
  }
  schedulePlaybackAudioForLooper(looperState, now = performance.now()) {
    this.controller.getPortTransport().update(looperState?.looperData?.portGroup, now);
    const data = looperState?.looperData;
    if ((!data?.transport.playing && !data?.pendingLaunch) || !data.timeline?.hasRecording())
      return;
    const timing = this.controller.getTimingForLooper(looperState, now);
    if (
      looperState.disposed ||
      looperState.root?.visible === false ||
      data.clockMetronomeId !== timing.metronomeId
    ) {
      this.controller.stopPlayback(looperState);
      return;
    }
    if (!timing.active) {
      this.controller.stopPlayback(looperState);
      return;
    }
    this.retimePendingLaunch(looperState, timing, now);
    const pending = data.pendingLaunch;
    if (
      pending &&
      (pending.targetBeat - timing.beatPosition) * timing.beatIntervalMs <= AUDIO_LOOKAHEAD_MS
    ) {
      this.prepareArmedAudio(looperState, timing, now);
      if (!data.queued && this.controller.isArmedBeatDue(data, timing))
        this.controller.launchArmedStart(looperState, timing, now);
    }
    if (!data.transport.playing && !pending?.prepared) return;
    const audioNow = this.getSchedulingAudioTime(looperState, now);
    if (!Number.isFinite(audioNow)) return;
    this.controller.applier.pruneScheduledAudio?.(audioNow);
    const scheduling = data.audioScheduling;
    const sourceNow = this.getAbsoluteSourcePosition(looperState, now);
    const rate = Math.max(this.getPlaybackRate(looperState, now), 0.0001);
    if (sourceNow >= 0 && !data.pendingLaunch)
      this.reconcilePlaybackAudioTargets(looperState, now, {
        sourceNow,
        audioNow,
        rate,
      });
    if (Math.abs(rate - scheduling.lastRate) > 1e-9) {
      this.controller.applier.cancelScheduledAudio?.(looperState);
      this.controller.adapter.cancelLooperPercussion?.(looperState.id);
      scheduling.scheduledThroughSourceMs = Math.max(sourceNow, 0);
      scheduling.includeStart = true;
      scheduling.lastRate = rate;
      if (sourceNow >= 0) this.reconcileScheduledAudioAtSource(looperState, sourceNow, audioNow);
    }
    if (sourceNow - scheduling.scheduledThroughSourceMs > AUDIO_MAX_LATE_MS * rate) {
      // Drop missed attacks, but keep a voice whose same note is still held.
      // Restarting every voice here invents another attack after a frame stall.
      const held = new Map();
      const duration = Math.max(data.timeline.durationMs, 1);
      if (!Number.isFinite(data.playbackLimitSourceMs) || sourceNow < data.playbackLimitSourceMs) {
        data.timeline.forEachActiveTrack((track) => {
          const note = this.getActiveNoteAtAbsoluteSource(track, sourceNow, duration);
          if (note) held.set(track.trackId, `${data.playbackGeneration}:${note.noteKey}`);
        });
      }
      this.controller.applier.cancelScheduledGenerations(
        (s) => s.looperId === looperState.id && held.get(s.trackId) !== s.noteKey,
      );
      this.controller.adapter.cancelLooperPercussion?.(looperState.id);
      scheduling.scheduledThroughSourceMs = Math.max(sourceNow, 0);
      scheduling.includeStart = true;
      if (sourceNow >= 0) this.reconcileScheduledAudioAtSource(looperState, sourceNow, audioNow);
    }
    let sourceEnd = sourceNow + AUDIO_LOOKAHEAD_MS * rate;
    if (data.pendingLaunch && !data.pendingLaunch.prepared) {
      const untilBoundary =
        (data.pendingLaunch.targetBeat - timing.beatPosition) * timing.beatIntervalMs;
      sourceEnd = Math.min(sourceEnd, sourceNow + untilBoundary * rate - 1e-6);
    }
    if (Number.isFinite(data.playbackLimitSourceMs))
      sourceEnd = Math.min(sourceEnd, data.playbackLimitSourceMs);
    if (sourceEnd < scheduling.scheduledThroughSourceMs) return;
    this.scheduleSourceRange(looperState, scheduling.scheduledThroughSourceMs, sourceEnd, {
      includeStart: scheduling.includeStart,
      sourceNow,
      rate,
      audioNow,
    });
    scheduling.scheduledThroughSourceMs = sourceEnd;
    scheduling.includeStart = false;
  }
  retimePendingLaunch(
    looper,
    timing,
    now,
    targetBeat = looper.looperData.pendingLaunch?.targetBeat,
  ) {
    const pending = looper.looperData.pendingLaunch;
    if (!pending) return;
    const wallMs = now + (targetBeat - timing.beatPosition) * timing.beatIntervalMs;
    if (
      pending.prepared &&
      (targetBeat !== pending.targetBeat ||
        Math.abs(wallMs - looper.looperData.audioScheduling.startWallMs) > 0.01 ||
        Math.abs(this.getPlaybackRate(looper, now) - looper.looperData.audioScheduling.lastRate) >
          1e-9)
    ) {
      this.controller.applier.cancelScheduledAudio(looper);
      this.controller.adapter.cancelLooperPercussion?.(looper.id);
      pending.prepared = false;
    }
    pending.targetBeat = targetBeat;
    looper.looperData.armedAfterBeatOrdinal = targetBeat - 1;
  }
  trimPlaybackAtBoundary(looper, limit, now) {
    const data = looper.looperData;
    const source = this.getAbsoluteSourcePosition(looper, now);
    const audioNow = this.getSchedulingAudioTime(looper, now);
    if (Number.isFinite(audioNow)) {
      const boundaryTime = audioNow + (limit - source) / this.getPlaybackRate(looper, now) / 1000;
      // Cancel only attacks from the next repetition. Current voices retain
      // their original expression and releases, even if the selection changes.
      this.controller.applier.cancelScheduledGenerations(
        (s) => s.looperId === looper.id && s.startsAt >= boundaryTime - 1e-7,
      );
      this.controller.adapter.cancelLooperPercussion?.(looper.id, {
        afterTime: boundaryTime,
      });
    }
    data.audioScheduling.scheduledThroughSourceMs = Math.min(
      data.audioScheduling.scheduledThroughSourceMs,
      limit - 1e-6,
    );
  }
  scheduleSourceRange(looperState, absoluteStartMs, absoluteEndMs, clock) {
    const data = looperState.looperData;
    const durationMs = Math.max(data.timeline.durationMs, 1);
    // Compute each cycle once, rather than repeatedly adding its fractional
    // duration and dividing again. Floating error at a shared window boundary
    // must not skip or repeat the next time-zero attack.
    const cycleAt = (time) => {
      const nearest = Math.round(time / durationMs);
      return Math.abs(time - nearest * durationMs) < 1e-7 ? nearest : Math.floor(time / durationMs);
    };
    const firstCycle = cycleAt(absoluteStartMs),
      lastCycle = cycleAt(absoluteEndMs);
    for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
      if (
        Number.isFinite(data.playbackLimitSourceMs) &&
        cycle * durationMs >= data.playbackLimitSourceMs - 1e-7
      )
        break;
      const includeStart = cycle === firstCycle ? clock.includeStart : true;
      const cycleStart = cycle * durationMs;
      const localStart = cycle === firstCycle ? Math.max(absoluteStartMs - cycleStart, 0) : 0;
      const localEnd = cycle === lastCycle ? Math.max(absoluteEndMs - cycleStart, 0) : durationMs;
      const eventSource = clock.trackTimeline || data.timeline;
      const entries = eventSource
        .getPerformanceEventsBetween(localStart, localEnd, {
          includeStart,
          includeEnd: true,
        })
        .map((entry) =>
          clock.trackTimeline ? { track: clock.trackTimeline, event: entry } : entry,
        );
      if (includeStart && localStart === 0) {
        for (const value of eventSource.getPerformanceEventsAt(0)) {
          const entry = clock.trackTimeline ? { track: clock.trackTimeline, event: value } : value;
          if (
            !entries.some(
              (candidate) => candidate.track === entry.track && candidate.event === entry.event,
            )
          ) {
            entries.unshift(entry);
          }
        }
      }
      for (const { track: trackTimeline, event } of entries) {
        const absoluteEventMs = cycleStart + event.timeMs;
        const scheduledTime =
          clock.audioNow + Math.max((absoluteEventMs - clock.sourceNow) / clock.rate / 1000, 0);
        const track = this.controller.getTrack(looperState, trackTimeline.trackIndex);
        if (!track) continue;
        const snapshot = createActionState();
        // Event endpoints retain their final expression even at the start of
        // an explicit Gap. Tail-padding neutralization is for visual sampling.
        trackTimeline.sample(event.timeMs, snapshot);
        this.controller.applier.scheduleTrackEvent(
          looperState,
          track,
          trackTimeline,
          event,
          snapshot,
          {
            volume: data.volume,
            scheduledTime,
            noteKey:
              `${data.playbackGeneration}:` +
              this.getNoteKeyForEvent(trackTimeline, event, cycle, durationMs),
            targetHonkIds: clock.targetHonkIds,
          },
        );
      }
      const drumEntries = clock.trackTimeline
        ? []
        : data.timeline.getDrumHitEventsBetween(localStart, localEnd, {
            includeStart,
            includeEnd: true,
          });
      for (const { event } of drumEntries) {
        const absoluteEventMs = cycleStart + event.timeMs;
        const scheduledTime =
          clock.audioNow + Math.max((absoluteEventMs - clock.sourceNow) / clock.rate / 1000, 0);
        this.controller.adapter.playStickPercussion?.(event.value, {
          volume: data.volume * (event.gain ?? 1),
          looperState,
          scheduledTime,
        });
        (data.audioScheduling.percussionTimes ||= []).push(scheduledTime);
        if (data.audioScheduling.percussionTimes.length > 32)
          data.audioScheduling.percussionTimes.shift();
      }
    }
  }
  reconcileScheduledAudioAtSource(looperState, absoluteSourceMs, audioNow) {
    const data = looperState.looperData;
    if (
      Number.isFinite(data.playbackLimitSourceMs) &&
      absoluteSourceMs >= data.playbackLimitSourceMs
    )
      return;
    const durationMs = Math.max(data.timeline.durationMs, 1);
    const localTimeMs = ((absoluteSourceMs % durationMs) + durationMs) % durationMs;
    data.timeline.forEachActiveTrack((trackTimeline) => {
      if (!trackTimeline.sampleGateActive?.(localTimeMs)) return;
      if (trackTimeline.getGateEventsAt(localTimeMs).length > 0) return;
      const track = this.controller.getTrack(looperState, trackTimeline.trackIndex);
      if (!track) return;
      const snapshot = createActionState();
      data.timeline.sampleTrack(trackTimeline, localTimeMs, snapshot);
      this.controller.applier.scheduleTrackEvent(
        looperState,
        track,
        trackTimeline,
        { type: "squeezeStart", timeMs: localTimeMs },
        snapshot,
        {
          volume: data.volume,
          scheduledTime: audioNow,
          noteKey:
            `${data.playbackGeneration}:` +
            this.getActiveNoteAtAbsoluteSource(trackTimeline, absoluteSourceMs, durationMs)
              ?.noteKey,
        },
      );
    });
  }
  reconcilePlaybackAudioTargets(looperState, now = performance.now(), resolvedClock = {}) {
    const data = looperState?.looperData;
    if (
      !data?.transport.playing ||
      data.pendingLaunch ||
      typeof this.controller.adapter.getAudioCurrentTime !== "function"
    ) {
      return;
    }
    const audioNow = Number.isFinite(resolvedClock.audioNow)
      ? resolvedClock.audioNow
      : this.getSchedulingAudioTime(looperState, now);
    if (!Number.isFinite(audioNow)) return;
    const sourceNow = Number.isFinite(resolvedClock.sourceNow)
      ? resolvedClock.sourceNow
      : this.getAbsoluteSourcePosition(looperState, now);
    const rate = Number.isFinite(resolvedClock.rate)
      ? resolvedClock.rate
      : Math.max(this.getPlaybackRate(looperState, now), 0.0001);
    const durationMs = Math.max(data.timeline.durationMs, 1);
    const coveredThrough = Math.max(sourceNow, data.audioScheduling.scheduledThroughSourceMs);

    data.timeline.forEachActiveTrack((trackTimeline) => {
      const track = this.controller.getTrack(looperState, trackTimeline.trackIndex);
      if (!track) return;
      const { joined } = this.controller.applier.reconcileAudioTargets(looperState, track);
      if (joined.length > 0) {
        const activeNote = this.getActiveNoteAtAbsoluteSource(trackTimeline, sourceNow, durationMs);
        if (activeNote) {
          const snapshot = createActionState();
          data.timeline.sampleTrack(trackTimeline, activeNote.localTimeMs, snapshot);
          this.controller.applier.scheduleTrackEvent(
            looperState,
            track,
            trackTimeline,
            {
              type: LooperActionEventType.SqueezeStart,
              timeMs: activeNote.localTimeMs,
            },
            snapshot,
            {
              volume: data.volume,
              scheduledTime: audioNow,
              noteKey: `${data.playbackGeneration}:` + activeNote.noteKey,
              targetHonkIds: joined,
            },
          );
        }
        if (coveredThrough > sourceNow) {
          this.scheduleSourceRange(looperState, sourceNow, coveredThrough, {
            includeStart: false,
            sourceNow,
            rate,
            audioNow,
            targetHonkIds: joined,
            trackTimeline,
          });
        }
      }
    });
  }
  getNoteKeyForEvent(trackTimeline, event, cycle, durationMs) {
    const owner = trackTimeline.getOwningNote(event, durationMs);
    return owner ? this.createNoteKey(trackTimeline, cycle + owner.cycleOffset, owner.event) : null;
  }
  getActiveNoteAtAbsoluteSource(trackTimeline, absoluteSourceMs, durationMs) {
    const cycle = Math.floor(absoluteSourceMs / durationMs);
    const localTimeMs = absoluteSourceMs - cycle * durationMs;
    const active = this.getActiveNoteBeforeAbsoluteTime(
      trackTimeline,
      absoluteSourceMs,
      durationMs,
    );
    return active ? { ...active, cycle, localTimeMs } : null;
  }
  getActiveNoteBeforeAbsoluteTime(trackTimeline, absoluteTimeMs, durationMs) {
    const cycle = Math.floor(absoluteTimeMs / durationMs);
    const localTimeMs = absoluteTimeMs - cycle * durationMs;
    const owner = trackTimeline.getActiveNote(localTimeMs, durationMs);
    return owner
      ? {
          noteKey: this.createNoteKey(trackTimeline, cycle + owner.cycleOffset, owner.event),
          startEvent: owner.event,
        }
      : null;
  }
  createNoteKey(trackTimeline, cycle, startEvent) {
    return `${trackTimeline.trackId}:cycle-${cycle}:start-${startEvent.id}`;
  }
}
