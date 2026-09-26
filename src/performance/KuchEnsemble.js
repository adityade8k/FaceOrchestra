import { KuchTutorial } from "../tutorial/kuch/KuchTutorial.js";
import {
  BPM,
  BEAT_MS,
  CHORDS,
  DRUMS,
  MELODY,
  PATTERN_CHANGES,
} from "../tutorial/kuch/score.js";
import { compilePattern } from "../compositions/CompositionCompiler.js";
const roles = ["chordLooper", "alternativeLooper", "percussionLooper"];

// Compatibility adapter: preserve the authored setup, score and port arbiter.
// Tutorial lesson execution is never started in recording mode.
export class KuchEnsemble {
  constructor(host) {
    this.host = host;
    this.r = host.r;
    this.a = host.adapter;
  }
  prepare() {
    this.dispose();
    this.a.clear();
    this.layout = new KuchTutorial(this.host);
    this.layout.setup();
    this.expected = new Map();
    for (const [index, role] of roles.entries()) {
      const h = this.a.get(role),
        routes = {};
      for (const name of ["D", "C", "percussion"]) {
        const track = h.tracks.find((t) =>
          this.a.ids(name).includes(t.connectedHonkId),
        );
        if (track)
          routes[name] = { trackId: track.trackId, trackIndex: track.index };
      }
      routes.percussionLooper = { trackId: "looper-self-percussion" };
      const timeline = compilePattern({
        events: [CHORDS.D, CHORDS.change, DRUMS][index],
        beats: 16,
        beatMs: BEAT_MS,
        routes,
        defaults: { vowel: "O", nose: (1 - 80 / 127) / 0.78 },
      });
      h.looperController.restoreState(
        h,
        {
          timeline: timeline.toJSON(),
          controls: {
            recordBeats: 16,
            gap: -1,
            volume: index < 2 ? -0.62 : -0.66,
          },
        },
        { preserveConnections: true },
      );
      this.expected.set(role, JSON.stringify(h.timeline.toJSON()));
    }
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
    for (const event of MELODY)
      if (!this.a.get(event.role))
        throw new Error(`Missing melody target ${event.role}`);
    return true;
  }
  schedule({ countAt, beatZero, wallNow, audioNow }) {
    this.validate();
    this.beatZero = beatZero;
    this.activePattern = "D";
    const metro = this.a.get("metronome");
    this.volume = metro.volume;
    metro.setBpm(BPM);
    metro.beatOriginMs = null;
    metro.setVolume(0);
    metro.play(countAt);
    for (const role of ["chordLooper", "percussionLooper"]) {
      const h = this.a.get(role),
        c = h.looperController;
      if (
        !c.armPlayback(h, wallNow, c.getTimingForLooper(h, wallNow), {
          targetBeat: (beatZero - countAt) / BEAT_MS,
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
    const beat = (now - this.beatZero) / BEAT_MS;
    const next = PATTERN_CHANGES.find(([at]) => at > beat && at - beat <= 4);
    if (next && next[1] !== this.activePattern) {
      const h = this.a.get(
        next[1] === "D" ? "chordLooper" : "alternativeLooper",
      );
      h.looperController.startPlayback(h, now, { origin: "performance" });
      this.activePattern = next[1];
    }
    const target = MELODY.find(
      (e) => beat >= e.beat - 0.25 && beat < e.beat + e.beats,
    );
    this.a.focus(target?.role);
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
    this.layout?.dispose();
    this.layout = null;
    this.prepared = false;
  }
}
