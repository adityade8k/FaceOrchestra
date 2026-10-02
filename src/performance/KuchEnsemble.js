import { KuchLayout } from "../tutorial/kuch/KuchLayout.js";
import { prepareKuchBacking } from "../tutorial/kuch/prepareBacking.js";
import { kuchTiming } from "../tutorial/kuch/timing.js";
import { BPM, PATTERN_CHANGES } from "../tutorial/kuch/score.js";
import { kuchArrangement } from "../tutorial/kuch/arrangements.js";
const roles = ["chordLooper", "alternativeLooper", "percussionLooper"];

// Compatibility adapter: preserve the authored setup, score and port arbiter.
// Tutorial lesson execution is never started in recording mode.
export class KuchEnsemble {
  constructor(host, arrangement = kuchArrangement()) {
    this.host = host;
    this.r = host.r;
    this.a = host.adapter;
    this.arrangement = arrangement;
  }
  prepare() {
    this.dispose();
    this.a.clear();
    this.layout = new KuchLayout(this.host);
    this.layout.setup();
    const metro = this.a.get("metronome");
    this.originalSetBpm = metro.setBpm;
    metro.setBpm = (value) =>
      this.r.capture?.active || this.beatZero != null
        ? metro.bpm
        : this.originalSetBpm.call(metro, value);
    this.expected = prepareKuchBacking(this.a);
    for (
      let i = 0;
      i < this.r.honkContactSystem.settings.consecutiveEntryFrames;
      i++
    )
      this.r.honkContactSystem.update();
    this.prepared = true;
    this.cancel();
    this.validate();
  }
  validate() {
    if (!this.prepared) throw new Error("Prepare ensemble first");
    for (const role of roles) {
      const h = this.a.get(role);
      if (!h || JSON.stringify(h.timeline.toJSON()) !== this.expected.get(role))
        throw new Error(`Repair ${role}: prepare the ensemble again`);
      if (
        !this.r.metronomeConnectionManager.getConnectionForTarget(
          "looper",
          h.id,
        )
      )
        throw new Error(`Reconnect ${role}`);
    }
    for (const event of this.arrangement.events)
      if (!this.a.get(event.role))
        throw new Error(`Missing melody target ${event.role}`);
    return true;
  }
  schedule({ countAt, beatZero, wallNow, audioNow, bpm = BPM }) {
    this.validate();
    this.beatZero = beatZero;
    this.activePattern = "D";
    const metro = this.a.get("metronome");
    this.volume = metro.volume;
    this.timing = kuchTiming(bpm, beatZero);
    this.originalSetBpm.call(metro, bpm);
    metro.beatOriginMs = null;
    metro.setVolume(0);
    metro.play(countAt);
    for (const role of ["chordLooper", "percussionLooper"]) {
      const h = this.a.get(role),
        c = h.looperController;
      if (
        !c.armPlayback(h, wallNow, c.getTimingForLooper(h, wallNow), {
          targetBeat: (beatZero - countAt) / this.timing.beatMs,
          audioAnchor: { wallMs: wallNow, audioSeconds: audioNow },
          origin: "performance",
        })
      )
        throw new Error(`Could not start ${role}`);
    }
  }
  play() {
    if (this.volume !== undefined)
      this.a.get("metronome")?.setVolume(this.volume);
  }
  update(now) {
    this.layout?.afterFrame(now);
    if (this.beatZero == null) return;
    const beat = (now - this.beatZero) / this.timing.beatMs;
    const next = PATTERN_CHANGES.find(([at]) => at > beat && at - beat <= 4);
    if (next && next[1] !== this.activePattern) {
      const h = this.a.get(
        next[1] === "D" ? "chordLooper" : "alternativeLooper",
      );
      h.looperController.startPlayback(h, now, { origin: "performance" });
      this.activePattern = next[1];
    }
    // Recording guidance is owned by TutorialTimingCues, including bend holds.
    this.a.focus(null);
    if (beat >= 136) this.cancel();
  }
  cancel() {
    this.beatZero = null;
    for (const role of roles) this.a.get(role)?.stop();
    this.a.get("metronome")?.pause();
    this.a.releaseAll({ preserveSticks: true });
    this.play();
  }
  dispose() {
    if (this.layout) {
      this.cancel();
      const metro = this.a.get("metronome");
      if (metro && this.originalSetBpm) metro.setBpm = this.originalSetBpm;
    }
    this.layout?.dispose();
    this.layout = null;
    this.prepared = false;
  }
}
