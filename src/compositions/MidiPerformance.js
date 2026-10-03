import { validateComposition } from "./CompositionRegistry.js";
import { tuningForMidi } from "../tutorial/composition.js";
import { GenericTutorial, assessDataLesson } from "../tutorial/GenericTutorial.js";
import { DataGuidance } from "./DataEnsemble.js";
import { MidiScorePlayer } from "./MidiScorePlayer.js";

// Separate capability contract: the conservative monophonic importer and the
// existing authored compositions keep their established behavior.
export function validateMidiPerformance(d) {
  validateComposition(d);
  const fail = () => { throw new Error("Invalid polyphonic MIDI composition"); };
  if (d.playback !== "polyphonic-midi-v1" || !Number.isFinite(d.score.durationSeconds) ||
      d.score.durationSeconds <= 0 || d.score.durationSeconds > 3600 ||
      d.score.tempo.length !== 1 || Math.abs(d.bpm - 60000000 / d.score.tempo[0].us) > 1e-8 ||
      !Number.isInteger(d.requirements.maxPlaybackVoices) || d.requirements.maxPlaybackVoices < 1 ||
      d.requirements.maxPlaybackVoices > 128) fail();
  const roles = new Map();
  for (const r of d.arrangement.recipes) {
    if (roles.has(r.role) || !["honk", "metronome"].includes(r.kind) ||
        !Array.isArray(r.position) || r.position.length !== 3 || !r.position.every(Number.isFinite) ||
        !(r.scale > 0 && r.scale <= 20) ||
        (r.kind === "honk" && (!Number.isInteger(r.midi) || r.midi < 36 || r.midi > 84))) fail();
    roles.set(r.role, r);
  }
  if (roles.get("metronome")?.kind !== "metronome" ||
      [...roles.values()].filter(r=>r.kind === "metronome").length !== 1 || roles.size > 64) fail();
  const ids = new Set();
  let previous = -Infinity;
  if (!d.score.events.length || d.score.events.length > 200000) fail();
  for (const e of d.score.events) {
    if (!e.id || ids.has(e.id) || roles.get(e.role)?.midi !== e.midi ||
        !["melody", "bass", "harmony"].includes(e.part) ||
        ![e.startSeconds, e.releaseSeconds, e.endSeconds, e.durationSeconds].every(Number.isFinite) ||
        e.startSeconds < 0 || e.startSeconds < previous || e.releaseSeconds <= e.startSeconds ||
        e.endSeconds < e.releaseSeconds || e.endSeconds > d.score.durationSeconds + 1e-8 ||
        Math.abs(e.endSeconds - e.startSeconds - e.durationSeconds) > 1e-8 ||
        !Number.isInteger(e.velocity) || e.velocity < 1 || e.velocity > 127 ||
        e.bend.some(p=>p.semitones !== 0) || e.expression.length) fail();
    previous = e.startSeconds;
    ids.add(e.id);
  }
  for (const l of d.lessons) {
    if (!(l.startSeconds >= 0 && l.endSeconds > l.startSeconds && l.endSeconds <= d.score.durationSeconds) ||
        !Array.isArray(l.eventIds) || !l.eventIds.length || l.eventIds.some(id=>!ids.has(id))) fail();
    for (const e of d.score.events) {
      // Every phrase starts/ends at a silence boundary, including pedal tails.
      if ((e.startSeconds < l.startSeconds && e.endSeconds > l.startSeconds + 1e-8) ||
          (e.startSeconds < l.endSeconds && e.endSeconds > l.endSeconds + 1e-8)) fail();
    }
  }
  return d;
}

export function melodyDefinition(definition, lesson = null) {
  return { ...definition, score: { ...definition.score,
    events: definition.score.events.filter(e=>e.part === "melody" && (!lesson || lesson.eventIds.includes(e.id)))
      .map(e=>({ ...e, durationSeconds: e.releaseSeconds - e.startSeconds, bend: null })) } };
}

export class MidiEnsemble {
  constructor(host, definition) {
    Object.assign(this, { host, definition, r: host.r, a: host.adapter });
    this.anchor = null;
  }
  prepare() {
    this.dispose();
    validateMidiPerformance(this.definition);
    this.a.clear();
    this.a.begin("learner");
    for (const recipe of this.definition.arrangement.recipes) {
      if (!this.r.createSpawnedComponent(recipe.kind, { name: recipe.role, baseScale: recipe.scale,
        ...(recipe.kind === "honk" ? { tuning: tuningForMidi(recipe.midi) } : {}) }))
        throw new Error(`Cannot prepare ${recipe.role}`);
      const h = this.r.activeInstrumentState;
      h.root.position.fromArray(recipe.position).applyQuaternion(this.a.layoutRotation).add(this.a.anchor);
      h.root.quaternion.copy(this.a.layoutRotation);
      h.root.updateMatrixWorld(true);
      this.a.roles.set(recipe.role, [h.id]);
      if (recipe.kind === "honk") {
        h.setVowel(recipe.vowel);
        this.a.labelPresentation.styleNote(h);
      }
    }
    const metro = this.a.get("metronome");
    this.originalSetBpm = metro.setBpm;
    this.originalVolume = metro.volume;
    metro.setBpm(this.definition.bpm);
    metro.setBpm = value => this.anchor === null ? this.originalSetBpm.call(metro, value) : metro.bpm;
    this.prepared = true;
    this.validate();
  }
  validate() {
    if (!this.prepared) throw new Error("Prepare ensemble first");
    for (const recipe of this.definition.arrangement.recipes) {
      const h = this.a.get(recipe.role);
      if (!h || h.disposed || (recipe.kind === "honk" && Math.abs(this.a.midi(h) - recipe.midi) > .25))
        throw new Error(`Prepare the ensemble again: ${recipe.role} is missing or retuned.`);
    }
    return true;
  }
  schedule({ countAt, beatZero, wallNow, audioNow, startSeconds = 0,
    endSeconds = this.definition.score.durationSeconds, includeMelody = false }) {
    this.cancel();
    this.validate();
    this.anchor = beatZero;
    this.endSeconds = endSeconds;
    const metro = this.a.get("metronome");
    this.originalSetBpm.call(metro, this.definition.bpm);
    metro.setVolume(0);
    metro.beatOriginMs = null;
    metro.play(countAt);
    const audio = this.r.audioSystem;
    this.player = new MidiScorePlayer(this.definition, {
      context: audio.audioContextService.context, destination: audio.masterBus.input,
    });
    this.player.start({ audioOrigin: audioNow + (beatZero - wallNow) / 1000,
      startSeconds, endSeconds, includeMelody });
  }
  play() {}
  update(now) {
    if (this.anchor === null) return;
    if (this.r.audioSystem.audioContextService.context?.state !== "running" || !this.a.get("metronome")?.playing) {
      this.cancel();
      return;
    }
    this.player.update();
    const time = (now - this.anchor) / 1000;
    const active = new Map();
    for (const e of this.player.events) {
      if (time >= e.startSeconds && time < e.endSeconds)
        active.set(e.role, Math.max(active.get(e.role) || 0, e.velocity / 127));
    }
    for (const recipe of this.definition.arrangement.recipes) {
      const h = this.a.get(recipe.role);
      if (active.has(recipe.role)) h?.performance?.setAutomationLayer("midi-score", { squeeze: active.get(recipe.role) });
      else h?.performance?.clearAutomationLayer("midi-score");
    }
    if (time >= this.endSeconds + .03) this.cancel();
  }
  cancel() {
    this.anchor = null;
    this.player?.stop();
    for (const recipe of this.definition.arrangement.recipes)
      this.a.get(recipe.role)?.performance?.clearAutomationLayer("midi-score");
    const metro = this.a.get("metronome");
    metro?.pause();
    if (this.originalVolume !== undefined) metro?.setVolume(this.originalVolume);
    this.a.releaseAll();
    this.a.focus(null);
  }
  dispose() {
    this.cancel();
    const metro = this.a.get("metronome");
    if (metro && this.originalSetBpm) metro.setBpm = this.originalSetBpm;
    this.prepared = false;
  }
}

export class MidiTutorial extends GenericTutorial {
  constructor(host, definition) {
    super(host, definition);
    this.ensemble = new MidiEnsemble(host, definition);
    this.feedback = "Demonstrate plays every note. Practice plays bass and harmony while you perform the upper line.";
  }
  cancel() {
    this.generation = (this.generation || 0) + 1;
    super.cancel();
  }
  async action(id) {
    if (id === "recenter") return this.host.panel.recenter(this.r.getUserCamera(), true);
    if (id === "midi-stop") {
      this.cancel();
      this.feedback = "Stopped. Demonstrate or Practice starts this section again.";
      return;
    }
    if (id === "midi-pause" && ["demo", "practice"].includes(this.phase)) {
      this.pausedPhase = this.phase;
      this.pausedSeconds = Math.max(this.step.startSeconds, Math.min(this.step.endSeconds, (performance.now() - this.origin) / 1000));
      this.cancel();
      this.phase = "paused";
      this.guide.anchorMs = null;
      this.feedback = "Paused. Resume continues here; Practice / Retry restarts assessment.";
      return;
    }
    const resume = id === "midi-pause" && this.phase === "paused";
    if (!["step-demo", "step-practice"].includes(id) && !resume) return super.action(id);
    const phase = resume ? this.pausedPhase : id === "step-demo" ? "demo" : "practice";
    const startSeconds = resume ? this.pausedSeconds : this.step.startSeconds;
    this.cancel();
    const token = this.generation;
    try {
      await this.r.audioSystem.ensureAudio();
      if (token !== this.generation) return;
      this.ensemble.validate();
      const now = performance.now(), audio = this.r.audioSystem.audioContextService.context;
      this.anchor = now + (resume ? 100 : 4 * 60000 / this.definition.bpm);
      this.origin = this.anchor - startSeconds * 1000;
      this.last = now;
      this.heard = [];
      this.resumed = resume;
      this.guide = new DataGuidance(melodyDefinition(this.definition, this.step), this.origin);
      this.phase = phase;
      this.ensemble.schedule({ countAt: now, beatZero: this.origin, wallNow: now, audioNow: audio.currentTime,
        startSeconds, endSeconds: this.step.endSeconds, includeMelody: phase === "demo" });
      this.feedback = phase === "demo" ? "Full performance · original timing, dynamics and pedal holds." : "Play the upper row. Bass and harmony are automatic. Release at the key-release cues.";
    } catch (error) {
      this.cancel();
      this.feedback = error.message;
    }
  }
  update(now) {
    if (!["demo", "practice"].includes(this.phase)) return;
    if (now - this.last > 250 || this.r.audioSystem.audioContextService.context?.state !== "running") {
      this.cancel();
      this.feedback = "Playback interrupted. Start again for a fresh count-in.";
      return;
    }
    this.last = now;
    this.ensemble.update(now);
    const time = (now - this.origin) / 1000;
    if (this.ensemble.anchor === null && time < this.step.endSeconds) {
      this.cancel();
      this.feedback = "Stopped by the Metronome. Demonstrate or Practice restarts playback.";
      return;
    }
    if (time < this.step.endSeconds + .04) return;
    const learner = this.phase === "practice";
    this.a.observe(now);
    this.cancel();
    if (learner && !this.resumed) {
      const result = assessDataLesson(melodyDefinition(this.definition), this.step, this.heard, this.origin);
      this.outcomes[this.step.id] = result.ok ? "passed" : "retry";
      this.feedback = `${result.correct}/${result.total} matched · ${result.extra} extra. ${result.ok ? this.step.success : this.step.retry}`;
      this.persist();
    } else this.feedback = learner ? "Resumed practice complete. Retry the whole section for assessment." : "Performance complete. Practice to play the upper line.";
  }
  model(now) {
    const model = super.model(now);
    model.actions.unshift({ id: "midi-pause", label: this.phase === "paused" ? "Resume" : "Pause", disabled: !this.phase },
      { id: "midi-stop", label: "Stop", disabled: !this.phase });
    if (this.phase === "paused") {
      model.instruction = `${this.step.setup}\nPaused at ${this.pausedSeconds.toFixed(2)} seconds. Resume continues here.`;
      this.host.panel.setTransport("Paused");
    }
    return model;
  }
  dispose() {
    this.cancel();
    this.ensemble.dispose();
  }
}

export function midiPerformance(value) {
  const definition = validateMidiPerformance(value);
  return {
    definition,
    createEnsemble: host => new MidiEnsemble(host, definition),
    createGuidance: anchor => new DataGuidance(melodyDefinition(definition), anchor),
    enterTutorial: async host => {
      host.freePlayScene ??= host.r.sceneSerializer.serialize();
      host.dataTutorial = new MidiTutorial(host, definition);
      host.dataTutorial.prepare();
      host.r.sessionMode = "practice";
    },
  };
}
