import { GenericTutorial } from "./GenericTutorial.js";
import { FixedBackingEnsemble } from "./FixedBackingEnsemble.js";
import { MelodyLayoutFrame } from "./MelodyLayoutFrame.js";
import { assessMelody, MelodyGuidance } from "../compositions/MelodyScore.js";
import { visualCueTime } from "./GuidedPlayOffset.js";

export class SongTutorial extends GenericTutorial {
  constructor(host, definition, { Ensemble = FixedBackingEnsemble, accompaniment = true, maxBpm = 115,
    resolveLesson = (definition, lesson) => ({ definition, lesson }) } = {}) {
    super(host, definition);
    this.ensemble = new Ensemble(host, definition);
    this.accompaniment = accompaniment;
    this.maxBpm = maxBpm;
    this.resolveLesson = resolveLesson;
    this.tempoSelected = false;
    this.hasBends = definition.score.events.some(e => e.bend?.length);
    this.feedback = "Demonstrate this phrase, then try it yourself. Preview full arrangement plays the whole piece. " +
      (accompaniment ? "Backing is prepared in the Loopers." : this.hasBends
        ? "Play the melody with either hand. Keep Trigger held through bends; the triangle shows the target and the dot shows your bend."
        : "Play every note live with both hands. This song has no Looper or backing track.");
    this.onHidden = () => {
      if (document.hidden) this.ensemble.layoutFrame?.cancelDrag();
      if (document.hidden && this.phase) {
        this.cancel(); this.feedback = "Playback interrupted. Start again for a fresh count-in.";
      }
    };
    document.addEventListener("visibilitychange", this.onHidden);
  }
  prepare() {
    this.ensemble.prepare();
    this.ensemble.layoutFrame = new MelodyLayoutFrame(this.ensemble);
    this.ensemble.showMelody();
  }
  captureIntent(intent, state) { return this.ensemble.layoutFrame?.captureIntent(intent, state) || false; }
  accept(event) {
    if (this.phase === "practice" && event.origin === "learner" &&
        this.ensemble.beatAtWall(event.startMs) >= this.guide.startBeat - .22) this.heard.push(event);
  }
  cancel() {
    this.generation = (this.generation || 0) + 1;
    this.ensemble.cancel(); this.a.setVirtualsActive(false);
    this.phase = null; this.note = null; this.a.focus(null);
    this.playback = null;
    this.host.cues?.reset();
    this.ensemble.layoutFrame?.setEnabled(true);
    if (this.ensemble.prepared) this.ensemble.showMelody();
  }
  async action(id) {
    if (id === "recenter") return this.host.panel.recenter(this.r.getUserCamera(), true);
    if (id === "exit") { this.cancel(); return this.host.enterPlay(); }
    if (id === "tempo-down" || id === "tempo-up") {
      const metro = this.a.get("metronome");
      metro.setBpm(metro.bpm + (id === "tempo-up" ? 5 : -5));
      this.tempoSelected = true;
      // The Metronome preserves beat phase when tempo changes. Keep the
      // learner's count-in on that clock rather than the old deadline.
      const now = performance.now();
      if (this.phase && this.ensemble.beatAt(now) < this.guide.startBeat) {
        this.anchor = now + (this.guide.startBeat - this.ensemble.beatAt(now)) * 60000 / metro.bpm;
        this.ensemble.anchor = this.anchor;
      }
      this.r.updateMetronomeLabel(metro); return;
    }
    if (id === "rishte-stop") {
      this.cancel(); this.feedback = "Stopped. Demonstrate plays this step; Practice retries it. Preview plays the full arrangement."; return;
    }
    if (["previous-step", "next-step"].includes(id)) {
      this.cancel();
      this.index = Math.max(0, Math.min(this.definition.lessons.length - 1, this.index + (id === "next-step" ? 1 : -1)));
      this.ensemble.showMelody();
      this.feedback = `Ready. Practice begins with ${this.step.countInBeats ?? 4} Metronome beats. Navigation does not earn mastery.`;
      this.persist(); return;
    }
    if (!["rishte-preview", "step-demo", "step-practice"].includes(id)) return;
    this.cancel();
    this.ensemble.layoutFrame?.setEnabled(false);
    const token = this.generation;
    try {
      await this.r.audioSystem.ensureAudio();
      if (token !== this.generation) return;
      this.ensemble.validate();
      const preview = id === "rishte-preview";
      const demonstrate = preview || id === "step-demo";
      this.playback = preview ? { definition: this.definition, lesson: this.step } :
        this.resolveLesson(this.definition, this.step);
      const { definition: playbackDefinition, lesson: playbackLesson } = this.playback;
      this.fullDemo = demonstrate && (preview || this.step.completePerformance);
      const startBeat = this.fullDemo ? 0 : playbackLesson.startBeat;
      const endBeat = this.fullDemo ? playbackDefinition.score.durationBeats : playbackLesson.endBeat;
      const metro = this.a.get("metronome");
      if (!this.tempoSelected && !preview && !this.step.completePerformance)
        metro.setBpm(Math.min(metro.bpm, this.step.recommendedBpm));
      this.ensemble.prepareAttempt?.({ startBeat, endBeat, backing: playbackDefinition.arrangement.backing });
      const now = performance.now(), bpm = metro.bpm;
      const countInBeats = preview ? 4 : (playbackLesson.countInBeats ?? 4);
      this.anchor = now + countInBeats * 60000 / bpm; this.last = now; this.heard = [];
      this.ensemble.schedule({ countAt: now, beatZero: this.anchor, wallNow: now,
        audioNow: this.r.audioSystem.audioContextService.context.currentTime, bpm, startBeat, endBeat,
        events: playbackDefinition.score.events, backing: playbackDefinition.arrangement.backing,
        origin: demonstrate ? "demonstration" : "performance" });
      this.guide = new MelodyGuidance(this.ensemble, playbackDefinition, startBeat, endBeat);
      this.guide.mode = demonstrate ? "demonstration" : "practice";
      this.ensemble.showMelody();
      this.a.setVirtualsActive(demonstrate, "demonstration");
      this.phase = demonstrate ? "demo" : "practice";
      if (this.fullDemo) this.previewed = true;
      this.feedback = demonstrate ? `${this.fullDemo ? "Full arrangement" : this.step.title}: watch the melody targets play${this.accompaniment ? " with the Looper backing" : ""}. Demonstration earns no practice credit.` :
        this.hasBends ? "Press at the highlighted square. Keep Trigger held while following the bend triangle; the dot shows your bend. Release and press again for the repeated accents. Either hand works. Cues continue on the beat." :
          "Follow the beat: the highlighted square marks the current note and the white circle marks the next. Cues keep moving if you miss a note. Sustain circles are a guide; hold as long as you like. Release Trigger to stop, or keep it held and aim at another Honk to play it. Either hand is accepted.";
    } catch (error) { this.cancel(); this.feedback = error.message; }
  }
  update(now) {
    this.ensemble.layoutFrame?.update();
    if (!this.phase) return;
    if (now - this.last > 250 || this.r.audioSystem.audioContextService.context?.state !== "running") {
      this.cancel(); this.feedback = "Playback interrupted. Start again for a fresh count-in."; return;
    }
    this.last = now;
    try {
      const beat = this.ensemble.beatAt(now);
      this.ensemble.update(now);
      if (this.ensemble.anchor === null && beat < this.guide.endBeat) {
        this.cancel(); this.feedback = "Stopped by the Metronome. Start again for a fresh count-in."; return;
      }
      if (this.phase === "demo") this.ensemble.hands.play(this.guide.step.events, beat, now);
      if (beat < this.guide.endBeat) return;
      const learner = this.phase === "practice";
      this.a.observe(now);
      const result = learner ? assessMelody(this.playback.definition, this.playback.lesson, this.heard,
        time => this.ensemble.beatAtWall(time)) : null;
      this.cancel();
      if (learner) {
        this.outcomes[this.step.id] = result.ok ? "passed" : "retry";
        this.feedback = `${result.correct}/${result.total} matched · ${result.extra} extra. ${result.ok ? "Phrase complete. Continue when ready." : this.hasBends ? "Try again: follow the bend target while holding, then release before the next press. Tempo −5 can slow the phrase." : "Try again: prepare at the white circle, press Trigger when the square lights up, then release before the next note."}`;
        this.persist();
      } else this.feedback = this.fullDemo ? "Full preview complete. Practice when ready, or replay the arrangement." :
        "Demonstration complete. Practice this phrase, or demonstrate it again.";
    } catch (error) { this.cancel(); this.feedback = error.message; }
  }
  model(now) {
    const b = (id, label, disabled = false) => ({ id, label, disabled });
    const bpm = this.a.get("metronome")?.bpm || this.definition.bpm;
    const guidance = this.phase ? this.guide.model(now) : {};
    if (this.phase) guidance.instruction = this.guide.model(visualCueTime(this.r, now)).instruction;
    this.host.panel.setTransport(`${bpm} BPM${guidance.transport ? ` · ${guidance.transport}` : " · Ready"}`);
    const idleLesson = this.phase ? null : this.resolveLesson(this.definition, this.step).lesson;
    const count = this.phase ? this.guide.step.events.length : idleLesson.eventIds.length;
    const span = this.phase ? this.guide.endBeat - this.guide.startBeat : idleLesson.endBeat - idleLesson.startBeat;
    return {
      visible: true, title: this.phase === "demo" ? (this.fullDemo ? "Demonstrate full arrangement" : `Demonstrate · ${this.step.title}`) : this.step.title,
      instruction: `${bpm} BPM · ${count} melody notes · ${span.toFixed(1)} beats.\n${guidance.instruction || "Hold Grip on the blue frame to move and rotate it. Drag an orange corner or use thumbstick left/right to resize. Reset restores the original layout and deleted Honks. Release to place, then Demonstrate or Practice."}\n${this.step.completePerformance ? "" : `Suggested practice tempo: ${this.step.recommendedBpm} BPM. `}Tempo −/+ keeps your chosen speed across retries and phrases. Source: ${this.definition.sourceBpm} BPM.`,
      feedback: this.hasBends && !this.phase ? `${this.step.goal}\n${this.feedback}` : this.feedback,
      progress: `${this.definition.title} · ${this.index + 1}/${this.definition.lessons.length}${this.outcomes[this.step.id] === "passed" ? " · Passed" : ""}`,
      navigation: [b("step-demo", this.step.completePerformance ? "Demonstrate full arrangement" : "Demonstrate"),
        b("step-practice", "Practice / Retry"), b("previous-step", "Previous", this.index === 0),
        b("next-step", "Next phrase", this.index === this.definition.lessons.length - 1)],
      actions: [b("tempo-down", "Tempo −5", bpm <= 30), b("tempo-up", "Tempo +5", bpm >= this.maxBpm),
        ...(!this.step.completePerformance ? [b("rishte-preview", this.previewed ? "Replay full arrangement" : "Preview full arrangement")] : []),
        b("rishte-stop", "Stop", !this.phase), b("exit", "Exit")],
    };
  }
  dispose() {
    this.cancel(); this.ensemble.dispose();
    document.removeEventListener("visibilitychange", this.onHidden);
  }
}
