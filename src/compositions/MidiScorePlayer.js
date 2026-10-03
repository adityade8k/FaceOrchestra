import { HonkVoice } from "../audio/honk/HonkVoice.js";
import { HONK_MASTER_GAIN } from "../config/audio.js";
import { tuningForMidi } from "../tutorial/composition.js";
import { createHonkTuning } from "../instruments/honk/HonkTuning.js";

// A bounded look-ahead scheduler for this through-played MIDI score. Each
// source attack owns a voice, including repeated pitches held by the pedal.
export class MidiScorePlayer {
  constructor(definition, { context, destination, createVoice = options => new HonkVoice(options) }) {
    Object.assign(this, { definition, context, destination, createVoice });
    this.voices = new Map();
    this.running = false;
  }
  start({ audioOrigin, startSeconds = 0, endSeconds = this.definition.score.durationSeconds, includeMelody = false }) {
    this.stop();
    Object.assign(this, { audioOrigin, startSeconds, endSeconds, includeMelody });
    this.events = this.definition.score.events.filter(e =>
      (includeMelody || e.part !== "melody") && e.endSeconds > startSeconds && e.startSeconds < endSeconds);
    this.index = 0;
    this.running = true;
    this.update();
  }
  update() {
    if (!this.running) return;
    const now = this.context.currentTime;
    while (this.index < this.events.length) {
      const e = this.events[this.index];
      const start = this.audioOrigin + Math.max(e.startSeconds, this.startSeconds);
      if (start > now + .15) break;
      this.index++;
      const end = this.audioOrigin + Math.min(e.endSeconds, this.endSeconds);
      if (end <= now) continue;
      const voice = this.createVoice({ context: this.context, destination: this.destination,
        vowel: e.part === "melody" ? "A" : e.part === "bass" ? "U" : "O" });
      this.voices.set(e.id, voice);
      const tuning = createHonkTuning(tuningForMidi(e.midi));
      voice.start(start);
      voice.update({ hornAmount: e.velocity / 127, masterGain: HONK_MASTER_GAIN * (e.part === "melody" ? 1 : .65),
        leftEar: tuning.pitchControl, rightEar: tuning.octaveControl, pitchSnap: tuning.pitchSnap,
        pitchBendSemitones: 0, activeVoiceCount: this.definition.requirements.maxPlaybackVoices }, { scheduledTime: start });
      // Gate closes at the exact pedal-aware source end. Only the ordinary
      // 10 ms de-click extends beyond it, never another musical beat.
      voice.release(.01, () => this.voices.delete(e.id), { scheduledTime: end });
    }
    if (now >= this.audioOrigin + this.endSeconds + .02) this.running = false;
  }
  stop() {
    this.running = false;
    for (const voice of this.voices.values()) voice.cancel();
    this.voices.clear();
  }
}
