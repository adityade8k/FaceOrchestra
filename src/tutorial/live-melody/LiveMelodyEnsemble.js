import { getHonkPitchBendRange } from "../../config/honk.js";
import { Vector3 } from "three";
import { tuningForMidi } from "../../compositions/jog/definition.js";
import { MelodyHands } from "../MelodyHands.js";
import { beatAtTime } from "../../compositions/MelodyScore.js";
import { validateLiveMelody } from "./score.js";

export class LiveMelodyEnsemble {
  constructor(host, definition) {
    Object.assign(this, { host, definition, r: host.r, a: host.adapter });
    this.anchor = null;
    this.history = [];
  }
  prepare({ bpm = this.definition.bpm } = {}) {
    this.dispose();
    this.validateDefinition();
    this.a.clear();
    this.a.begin("learner");
    this.a.anchor.add(new Vector3(-.25, 0, 0).applyQuaternion(this.a.layoutRotation));
    for (const recipe of this.definition.arrangement.recipes) {
      if (!this.r.createSpawnedComponent(recipe.kind, {
        name: recipe.role, baseScale: recipe.scale,
        ...(recipe.kind === "honk" ? { tuning: tuningForMidi(recipe.midi) } : {}),
      })) throw new Error(`Cannot prepare ${recipe.role}`);
      const h = this.r.activeInstrumentState;
      h.root.position.fromArray(recipe.position).applyQuaternion(this.a.layoutRotation).add(this.a.anchor);
      h.root.quaternion.copy(this.a.layoutRotation);
      h.root.updateMatrixWorld(true);
      this.a.roles.set(recipe.role, [h.id]);
      if (recipe.kind === "honk") {
        h.pitchBendRange = getHonkPitchBendRange(recipe);
        this.a.labelPresentation.styleNote(h);
      }
      if (recipe.kind === "looper") this.r.syncLooperTransformReference(h);
    }
    this.metro = this.a.get("metronome");
    this.originalSetBpm = this.metro.setBpm;
    this.metro.setBpm(bpm);
    this.metro.setVolume(.15);
    this.r.updateMetronomeLabel(this.metro);
    this.metro.setBpm = value => {
      const now = performance.now(), beat = this.anchor === null ? null : this.beatAt(now);
      const result = this.originalSetBpm.call(this.metro, Math.max(30, Math.min(this.definition.maxBpm ?? this.definition.bpm, value)));
      if (beat !== null) this.history.push({ atMs: now, beat, bpm: this.metro.bpm });
      this.r.updateMetronomeLabel(this.metro);
      return result;
    };
    this.hands = new MelodyHands(this);
    this.prepared = true;
    this.validate();
  }
  validateDefinition() { validateLiveMelody(this.definition); }
  validate() {
    if (!this.prepared) throw new Error("Prepare ensemble first");
    for (const recipe of this.definition.arrangement.recipes) {
      const h = this.a.get(recipe.role);
      if (!h || h.disposed || (recipe.kind === "honk" && Math.abs(this.a.midi(h) - recipe.midi) > .25))
        throw new Error(`Repair ${recipe.role}: missing or retuned target. Prepare ensemble again.`);
    }
    return true;
  }
  showMelody() {
    // Keep the full instrument layout stable. Only note indicators follow time.
    for (const recipe of this.definition.arrangement.recipes.filter(r => r.kind === "honk"))
      if (this.a.get(recipe.role)) this.a.get(recipe.role).root.visible = true;
    this.hands?.update();
  }
  schedule({ countAt, beatZero, bpm = this.definition.bpm, startBeat = 0,
    endBeat = this.definition.score.durationBeats }) {
    this.cancel();
    this.validate();
    this.startBeat = startBeat; this.endBeat = endBeat;
    this.anchor = beatZero;
    this.clockStartBeat = (beatZero - countAt) / (60000 / bpm);
    this.originalSetBpm.call(this.metro, bpm);
    this.r.updateMetronomeLabel(this.metro);
    this.metro.beatOriginMs = null;
    this.metro.play(countAt);
    this.history = [{ atMs: countAt, beat: startBeat - this.clockStartBeat, bpm }];
    this.showMelody();
  }
  beatAt(now) {
    if (this.anchor === null) return this.stoppedBeat ?? 0;
    return this.metro.getBeatTiming(now).beatPosition - this.clockStartBeat + this.startBeat;
  }
  beatAtWall(now) { return beatAtTime(this.history, now); }
  play() {}
  update(now) {
    if (this.anchor === null) return;
    if (!this.metro.playing || this.r.audioSystem.audioContextService.context?.state !== "running") {
      this.cancel(); return;
    }
    const beat = this.beatAt(now);
    this.hands?.update(this.definition.score.events, beat);
    // Preserve the exact final score beat for completion cues after stopping.
    if (beat >= this.endBeat) { this.cancel(); this.stoppedBeat = this.endBeat; }
  }
  cancel() {
    if (this.anchor !== null) this.stoppedBeat = this.beatAt(performance.now());
    this.anchor = null;
    this.metro?.pause();
    this.hands?.release();
    this.a.releaseAll(); this.a.focus(null);
  }
  dispose() {
    this.cancel();
    this.layoutFrame?.dispose(); this.layoutFrame = null;
    this.hands?.dispose(); this.hands = null;
    if (this.metro && this.originalSetBpm) this.metro.setBpm = this.originalSetBpm;
    this.prepared = false;
  }
}
