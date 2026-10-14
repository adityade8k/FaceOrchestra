import { pitchesMatch, validateBend } from "./validation.js";

// Learner-paced practice has no score deadline. A fresh, continuously voiced
// gesture must satisfy the current target and its sustain. The player controls
// release; full indicators never stop a voice, and failed attempts never
// consume a target.
export class NotePracticeGate {
  constructor(events, { anchorMs = 0, beatMs = 750, validate = null } = {}) {
    this.events = [...events].sort((a, b) => (a.beat ?? 0) - (b.beat ?? 0));
    this.anchorMs = anchorMs;
    this.armedAt = anchorMs;
    this.tempo = typeof beatMs === "function" ? beatMs : () => beatMs;
    this.validate = validate;
    this.index = 0;
    this.seen = new Set();
    this.durations = new Map();
    this.accepted = [];
    this.retries = 0;
    this.feedback = "";
    this.heldMs = 0;
    this.active = null;
    this.now = anchorMs;
  }
  get current() { return this.events[this.index] || null; }
  get complete() { return this.index >= this.events.length; }
  get beatMs() { return this.tempo(); }
  durationFor(target = this.current, beatMs = this.beatMs) {
    if (!target || this.isStrike(target)) return 0;
    return Math.max(0, target.minimumMs ?? (target.durationSeconds !== undefined
      ? target.durationSeconds * 1000 : (target.beats || 0) * beatMs));
  }
  isStrike(target) {
    return target.kind === "strike" || target.type === "strike" ||
      (!target.midis && target.midi === undefined && Boolean(target.type));
  }
  matches(event, target = this.current) {
    if (!target || event.origin !== "learner" || !Number.isFinite(event.startMs) ||
        event.startMs < this.armedAt || event.invalidMembers || event.voiceInterrupted) return false;
    if (this.isStrike(target)) return event.kind === "strike" && event.role === target.role &&
      (!target.type || target.type === "strike" || event.percussionType === target.type);
    return event.kind === "note" && event.voiced &&
      pitchesMatch(event.midis, target.midis || [target.midi]) &&
      (!target.vowel || event.vowel === target.vowel) &&
      (target.bend?.length || !(event.maxAbsBend > .5));
  }
  timingFor(event) {
    if (!this.durations.has(event.id)) {
      const beatMs = this.beatMs;
      this.durations.set(event.id, { beatMs, requiredMs: this.durationFor(this.current, beatMs) });
    }
    return this.durations.get(event.id);
  }
  update(now, gestures = []) {
    this.now = now;
    this.active = null;
    this.heldMs = 0;
    if (this.complete || now < this.anchorMs) return;
    for (const event of gestures) {
      if (event.startMs > now || this.seen.has(event.id) || !this.matches(event)) continue;
      const held = Math.max(0, now - (event.voicedStartMs ?? event.startMs));
      if (!this.active || held > this.heldMs) {
        this.active = event;
        this.heldMs = held;
        this.timingFor(event);
      }
    }
  }
  accept(event) {
    if (this.complete || !event || !["note", "strike"].includes(event.kind) ||
        event.origin !== "learner" || !Number.isFinite(event.startMs) ||
        event.startMs < this.armedAt || this.seen.has(event.id)) return false;
    this.seen.add(event.id);
    const target = this.current;
    let reason = "Play the highlighted note; this target is still waiting.";
    if (this.matches(event)) {
      const { requiredMs, beatMs } = this.timingFor(event);
      const heldMs = event.endMs - (event.voicedStartMs ?? event.startMs);
      const released = this.isStrike(target) ? event.withdrawn :
        event.released && event.allReleased !== false && event.articulated !== false;
      if (!released || !Number.isFinite(heldMs)) reason = "Release the note before continuing.";
      else if (heldMs + 1e-6 < requiredMs)
        reason = `Hold for ${(requiredMs / 1000).toFixed(2)} seconds in one continuous play. Try this note again.`;
      else {
        const validation = this.validate?.(target, event, { beatMs, requiredMs }) ||
          (target.bend?.length ? validateBend(event, target.bend) : { ok: true });
        if (validation.ok) {
          this.accepted.push({ target, event, requiredMs, beatMs });
          this.index++;
          this.armedAt = event.endMs;
          this.active = null;
          this.heldMs = 0;
          this.durations.clear();
          this.feedback = this.complete ? "Every note sustained and released. Phrase complete." : "";
          return true;
        }
        reason = validation.message || validation.reason || "Try this note and its written bend again.";
      }
    }
    this.retries++;
    this.feedback = reason;
    return false;
  }
  get requiredMs() {
    return this.active ? this.timingFor(this.active).requiredMs : this.durationFor();
  }
  get fraction() { return this.requiredMs ? Math.min(1, this.heldMs / this.requiredMs) : 0; }
  get readyToRelease() { return Boolean(this.active && this.heldMs >= this.requiredMs); }
  result() {
    return { ok: this.complete, correct: this.index, total: this.events.length,
      retries: this.retries, extra: 0, practiceMode: "note-by-note",
      message: this.complete ? "Every note sustained and released. Continue when ready." : this.feedback };
  }
  model(now = this.now) {
    const pitches = this.current?.midis || (Number.isFinite(this.current?.midi) ? [this.current.midi] : []);
    const name = pitches.length ? pitches.map(midi =>
      `${["C","C♯","D","E♭","E","F","F♯","G","A♭","A","B♭","B"][((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`).join(" + ") : this.current?.role || "note";
    return {
      transport: now < this.anchorMs ? `Count in: ${Math.ceil((this.anchorMs - now) / this.beatMs)}` :
        this.complete ? "Complete" : `Note ${this.index + 1}/${this.events.length} · ${this.active
          ? this.readyToRelease ? "Sustain complete" : `Hold ${(this.heldMs / 1000).toFixed(1)} / ${(this.requiredMs / 1000).toFixed(2)} s`
          : this.isStrike(this.current) ? "Waiting for your strike" : `Waiting · sustain ${(this.requiredMs / 1000).toFixed(2)} s`}`,
      instruction: this.complete ? "Every note is complete." :
        `${name}: ${this.isStrike(this.current) ? "strike, then withdraw" : "aim at the highlighted Honk and hold Trigger; yellow reaching the white edge marks the suggested sustain"}. White circle: upcoming note. Release Trigger when you want to stop, or aim at another Honk while holding to play it.`,
      feedback: this.feedback,
    };
  }
}

// Same cue interface as the timed guides. The cursor supplies the current
// highlight and a gray preview of the following target.
export class NotePracticeGuidance {
  constructor(gate, step = {}) {
    this.practiceGate = gate;
    this.mode = "practice";
    this.anchorMs = gate.anchorMs;
    this.step = { ...step, type: step.type || "phrase", timed: true, events: gate.events };
  }
  get beatMs() { return this.practiceGate.beatMs; }
  beatAt() { return this.practiceGate.current?.beat ?? this.step.beats ?? 0; }
  complete() { return this.practiceGate.complete; }
  model(now) { return this.practiceGate.model(now); }
}
