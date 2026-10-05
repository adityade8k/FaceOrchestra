import { GenericTutorial } from "../GenericTutorial.js";
import { RishteEnsemble } from "./RishteEnsemble.js";
import { RishteLayoutFrame } from "./RishteLayoutFrame.js";
import { assessMelody, RishteGuidance } from "./score.js";

export class RishteTutorial extends GenericTutorial {
  constructor(host, definition) {
    super(host, definition);
    this.ensemble = new RishteEnsemble(host, definition);
    this.feedback = "Demonstrate this phrase, then try it yourself. Preview full arrangement plays the whole piece. Backing is prepared in the Loopers.";
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
    this.ensemble.layoutFrame = new RishteLayoutFrame(this.ensemble);
    this.ensemble.showMelody(this.step.startBeat, this.step.endBeat);
  }
  captureIntent(intent, state) { return this.ensemble.layoutFrame?.captureIntent(intent, state) || false; }
  accept(event) {
    if (this.phase === "practice" && event.origin === "learner" &&
        this.ensemble.beatAtWall(event.startMs) >= this.step.startBeat - .22) this.heard.push(event);
  }
  cancel() {
    this.generation = (this.generation || 0) + 1;
    this.ensemble.cancel(); this.a.setVirtualsActive(false);
    this.phase = null; this.note = null; this.a.focus(null);
    this.host.cues?.reset();
    this.ensemble.layoutFrame?.setEnabled(true);
    if (this.ensemble.prepared) this.ensemble.showMelody(this.step.startBeat, this.step.endBeat);
  }
  async action(id) {
    if (id === "recenter") return this.host.panel.recenter(this.r.getUserCamera(), true);
    if (id === "exit") { this.cancel(); return this.host.enterPlay(); }
    if (id === "tempo-down" || id === "tempo-up") {
      const metro = this.a.get("metronome");
      metro.setBpm(metro.bpm + (id === "tempo-up" ? 5 : -5));
      this.r.updateMetronomeLabel(metro); return;
    }
    if (id === "rishte-stop") {
      this.cancel(); this.feedback = "Stopped. Demonstrate plays this step; Practice retries it. Preview plays the full arrangement."; return;
    }
    if (["previous-step", "next-step"].includes(id)) {
      this.cancel();
      this.index = Math.max(0, Math.min(this.definition.lessons.length - 1, this.index + (id === "next-step" ? 1 : -1)));
      this.ensemble.showMelody(this.step.startBeat, this.step.endBeat);
      this.feedback = "Ready. Practice begins with four Metronome beats. Navigation does not earn mastery.";
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
      this.fullDemo = demonstrate && (preview || this.step.completePerformance);
      const startBeat = this.fullDemo ? 0 : this.step.startBeat;
      const endBeat = this.fullDemo ? this.definition.score.durationBeats : this.step.endBeat;
      const metro = this.a.get("metronome");
      if (!preview && !this.step.completePerformance) metro.setBpm(Math.min(metro.bpm, this.step.recommendedBpm));
      const now = performance.now(), bpm = metro.bpm;
      this.anchor = now + 4 * 60000 / bpm; this.last = now; this.heard = [];
      this.ensemble.schedule({ countAt: now, beatZero: this.anchor, wallNow: now,
        audioNow: this.r.audioSystem.audioContextService.context.currentTime, bpm, startBeat, endBeat,
        origin: demonstrate ? "demonstration" : "performance" });
      this.guide = new RishteGuidance(this.ensemble, this.definition, startBeat, endBeat);
      this.ensemble.showMelody(startBeat, endBeat);
      this.a.setVirtualsActive(demonstrate, "demonstration");
      this.phase = demonstrate ? "demo" : "practice";
      if (this.fullDemo) this.previewed = true;
      this.feedback = demonstrate ? `${this.fullDemo ? "Full arrangement" : this.step.title}: watch both suggested hands play the melody with the Looper backing. Demonstration earns no practice credit.` :
        "Your turn: play the labelled L / R targets with both hands. Only the Looper accompaniment plays automatically. Either hand is accepted.";
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
      const result = learner ? assessMelody(this.definition, this.step, this.heard, time => this.ensemble.beatAtWall(time)) : null;
      this.cancel();
      if (learner) {
        this.outcomes[this.step.id] = result.ok ? "passed" : "retry";
        this.feedback = `${result.correct}/${result.total} matched · ${result.extra} extra. ${result.ok ? "Phrase complete. Continue when ready." : "Try again: prepare at the white circle, press Trigger as yellow shrinks to its smallest point, then hold as it expands to the current note’s red square."}`;
        this.persist();
      } else this.feedback = this.fullDemo ? "Full preview complete. Practice when ready, or replay the arrangement." :
        "Demonstration complete. Practice this phrase, or demonstrate it again.";
    } catch (error) { this.cancel(); this.feedback = error.message; }
  }
  model(now) {
    const b = (id, label, disabled = false) => ({ id, label, disabled });
    const bpm = this.a.get("metronome")?.bpm || this.definition.bpm;
    const guidance = this.phase ? this.guide.model(now) : {};
    this.host.panel.setTransport(`${bpm} BPM${guidance.transport ? ` · ${guidance.transport}` : " · Ready"}`);
    const count = this.phase ? this.guide.step.events.length : this.step.eventIds.length;
    const span = this.phase ? this.guide.endBeat - this.guide.startBeat : this.step.endBeat - this.step.startBeat;
    return {
      visible: true, title: this.phase === "demo" ? (this.fullDemo ? "Demonstrate full arrangement" : `Demonstrate · ${this.step.title}`) : this.step.title,
      instruction: `${bpm} BPM · ${count} melody notes · ${span.toFixed(1)} beats.\n${guidance.instruction || "Hold Grip on the blue frame to move, or drag an orange corner to resize. Thumbstick left/right resizes while holding. Release to place, then Demonstrate or Practice."}\n${this.step.completePerformance ? "" : `This phrase starts at ${this.step.recommendedBpm} BPM. `}Adjust speed with Tempo −/+ or the Metronome. Source: ${this.definition.sourceBpm} BPM.`,
      feedback: this.feedback,
      progress: `${this.definition.title} · ${this.index + 1}/${this.definition.lessons.length}${this.outcomes[this.step.id] === "passed" ? " · Passed" : ""}`,
      navigation: [b("step-demo", this.step.completePerformance ? "Demonstrate full arrangement" : "Demonstrate"),
        b("step-practice", "Practice / Retry"), b("previous-step", "Previous", this.index === 0),
        b("next-step", "Next phrase", this.index === this.definition.lessons.length - 1)],
      actions: [b("tempo-down", "Tempo −5", bpm <= 30), b("tempo-up", "Tempo +5", bpm >= 115),
        ...(!this.step.completePerformance ? [b("rishte-preview", this.previewed ? "Replay full arrangement" : "Preview full arrangement")] : []),
        b("rishte-stop", "Stop", !this.phase), b("exit", "Exit")],
    };
  }
  dispose() {
    this.cancel(); this.ensemble.dispose();
    document.removeEventListener("visibilitychange", this.onHidden);
  }
}
