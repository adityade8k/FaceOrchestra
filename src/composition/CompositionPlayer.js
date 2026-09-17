import { HONK_NOTE_GAIN_SETTINGS, HONK_RELEASE_SETTINGS } from "../config/audio.js";

const LAYER = "desktop-composition";

export class CompositionPlayer {
  constructor({ audioSystem, honks, score, onStateChange = () => {} }) {
    this.audioSystem = audioSystem;
    this.honks = honks;
    this.score = score;
    this.onStateChange = onStateChange;
    this.state = "stopped";
    this.generation = 0;
    this.voiceIds = new Set();
    this.context = null;
    this.startTime = 0;
    this.secondsPerBeat = 60 / score.tempoBpm;
    this.activePitches = new Set();
  }

  async play() {
    if (this.state === "starting" || this.state === "playing") return false;
    const generation = ++this.generation;
    this.setState("starting");
    try {
      // Called directly from the click, before any asynchronous work, to unlock
      // browser audio. A generation guards Stop/Restart during context.resume().
      const context = await this.audioSystem.ensureContext();
      if (generation !== this.generation) return false;
      if (!(this.score.tempoBpm > 0) || !Number.isFinite(this.score.tempoBpm)) {
        throw new Error("Composition tempo must be a positive finite number.");
      }
      this.context = context;
      this.secondsPerBeat = 60 / this.score.tempoBpm;
      this.startTime = context.currentTime + .35;
      const events = this.score.events;
      // The finite melody is scheduled in full, including releases. Rendering,
      // background tab throttling and JS timer jitter cannot move note onsets.
      for (const event of events) {
        const honk = this.honks.get(event.pitch);
        if (!honk) throw new Error(`Missing composition Honk: ${event.pitch}`);
        const voiceId = `composition:${generation}:${event.id}`;
        this.voiceIds.add(voiceId);
        this.audioSystem.scheduleHonkNote(voiceId,
          { ...honk.getLivePerformanceState(), squeeze: 1, bend: 0 }, honk.tuning, {
            context,
            startTime: this.startTime + event.startBeat * this.secondsPerBeat,
            duration: event.durationBeats * this.secondsPerBeat,
            onEnded: () => {
              if (generation !== this.generation) return;
              this.voiceIds.delete(voiceId);
              if (this.voiceIds.size === 0) {
                this.resetPresentation();
                this.setState("finished");
              }
            },
          });
      }
      this.setState("playing");
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      this.stop();
      this.setState("error");
      throw error;
    }
  }

  stop() {
    this.generation += 1;
    for (const voiceId of this.voiceIds) this.audioSystem.cancelScheduledHonk(voiceId);
    this.voiceIds.clear();
    this.resetPresentation();
    this.setState("stopped");
  }

  restart() {
    this.stop();
    return this.play();
  }

  setState(state) {
    this.state = state;
    this.onStateChange(state);
  }

  resetPresentation() {
    this.activePitches.clear();
    for (const honk of this.honks.values()) {
      honk.clearAutomationLayer(LAYER);
      honk.resolvePerformance();
    }
  }

  getPresentationTime() {
    if (!this.context) return 0;
    const timestamp = this.context.getOutputTimestamp?.();
    if (timestamp?.performanceTime > 0 && this.context.state === "running") {
      return Math.min(this.context.currentTime,
        timestamp.contextTime + (performance.now() - timestamp.performanceTime) / 1000);
    }
    return this.context.currentTime;
  }

  updatePresentation(now = this.getPresentationTime()) {
    if (this.state !== "playing") return;
    const amounts = new Map();
    this.activePitches.clear();
    for (const event of this.score.events) {
      const elapsed = now - this.startTime - event.startBeat * this.secondsPerBeat;
      if (elapsed < 0) break;
      const duration = event.durationBeats * this.secondsPerBeat;
      const tail = HONK_RELEASE_SETTINGS.liveFadeSeconds;
      if (elapsed >= duration + tail) continue;
      const attack = 1 - Math.exp(-Math.min(elapsed, duration) / HONK_NOTE_GAIN_SETTINGS.smoothingSeconds);
      const squeeze = attack * (elapsed < duration ? 1 : 1 - (elapsed - duration) / tail);
      amounts.set(event.pitch, Math.max(amounts.get(event.pitch) || 0, squeeze));
      this.activePitches.add(event.pitch);
    }
    for (const [pitch, honk] of this.honks) {
      const squeeze = amounts.get(pitch);
      if (squeeze === undefined) honk.clearAutomationLayer(LAYER);
      else honk.setAutomationLayer(LAYER, { squeeze });
      // Only presentation follows frames. The audio already has absolute times.
      honk.resolvePerformance();
    }
  }

  get beat() {
    return this.state === "playing"
      ? Math.max(0, (this.getPresentationTime() - this.startTime) / this.secondsPerBeat)
      : this.state === "finished" ? this.score.phrases.at(-1).startBeat + this.score.phrases.at(-1).durationBeats : 0;
  }
}
