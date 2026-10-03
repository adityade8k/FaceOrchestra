import { tuningForMidi } from "../composition.js";
import { compilePattern } from "../../compositions/CompositionCompiler.js";
import { beatAtTime, validateRishte } from "./score.js";

const LANES = ["foundation", "figures"];

// Arrangement orchestration only. Sound and sample-accurate handoffs belong to
// the existing Honks, Looper timelines, port transport and Metronome.
export class RishteEnsemble {
  constructor(host, definition) {
    Object.assign(this, { host, definition, r: host.r, a: host.adapter });
    this.anchor = null;
    this.history = [];
    this.expectedRevisions = new Map();
    this.expectedTakes = new Map();
    this.loopers = [];
  }
  prepare() {
    this.dispose();
    validateRishte(this.definition);
    this.a.clear(); this.a.begin("learner");
    for (const recipe of this.definition.arrangement.recipes) {
      if (!this.r.createSpawnedComponent(recipe.kind, { name: recipe.role, baseScale: recipe.scale,
        ...(recipe.kind === "honk" ? { tuning: tuningForMidi(recipe.midi) } : {}) }))
        throw new Error(`Cannot prepare ${recipe.role}`);
      const h = this.r.activeInstrumentState;
      h.root.position.fromArray(recipe.position).applyQuaternion(this.a.layoutRotation).add(this.a.anchor);
      h.root.quaternion.copy(this.a.layoutRotation); h.root.updateMatrixWorld(true);
      this.a.roles.set(recipe.role, [h.id]);
      if (recipe.kind === "honk") this.a.labelPresentation.styleNote(h);
      if (recipe.kind === "looper") this.r.syncLooperTransformReference(h);
    }
    const metro = this.a.get("metronome");
    this.metro = metro;
    this.originalSetBpm = metro.setBpm;
    metro.setBpm(this.definition.bpm);
    metro.setVolume(.15);
    // Scope the tempo range and history to this tutorial's own Metronome.
    metro.setBpm = value => {
      const result = this.originalSetBpm.call(metro, Math.min(115, Math.max(45, value)));
      if (this.anchor !== null) {
        const now = performance.now();
        this.history.push({ atMs: now, beat: this.beatAt(now), bpm: metro.bpm });
      }
      return result;
    };
    this.loopers = LANES.flatMap(lane => [0, 1].map(bank => this.a.get(`${lane}-${bank}`)));
    const ports = [...metro.connectionPorts.keys()];
    for (const [i, lane] of LANES.entries()) for (const bank of [0, 1]) {
      const h = this.a.get(`${lane}-${bank}`);
      this.r.metronomeConnectionManager.connect({ metronomeId: metro.id, portId: ports[i],
        targetKind: "looper", targetId: h.id, targetPortId: h.tracks[0].trackId });
      this.loadPattern(h, this.definition.arrangement.blocks[bank].patterns[i]);
    }
    this.prepared = true;
    this.validate();
  }
  validate() {
    if (!this.prepared) throw new Error("Prepare ensemble first");
    for (const recipe of this.definition.arrangement.recipes) {
      const h = this.a.get(recipe.role);
      if (!h || h.disposed || (recipe.kind === "honk" && Math.abs(this.a.midi(h) - recipe.midi) > .25))
        throw new Error(`Prepare again: ${recipe.role} is missing or retuned.`);
    }
    for (const h of this.loopers) {
      const wire = this.r.metronomeConnectionManager.getConnectionForTarget("looper", h.id);
      if (wire?.metronomeId !== this.metro.id) throw new Error("Reconnect the Loopers to their Metronome.");
      if (h.transport.recording || h.transport.recordArmed) throw new Error("Finish your Looper recording before starting the arrangement.");
    }
  }
  loadPattern(h, pattern) {
    const c = h.looperController, routes = {};
    if (this.snapshots && h.looperData.takeRevision !== this.expectedRevisions.get(h.id))
      throw new Error("A Looper take changed. Your new take has been kept; start again when ready.");
    for (const track of h.tracks) if (track.connectedHonkId != null) c.connections.disconnect(h, track.index);
    for (const role of new Set(pattern.events.map(e => e.role))) {
      const track = h.tracks.find(t => t.index > 0 && t.connectedHonkId == null);
      this.r.connectLooperTrackToHonk(h, track.index, this.a.get(role).id);
      routes[role] = { trackId: track.trackId, trackIndex: track.index };
    }
    const timeline = compilePattern({ ...pattern, beatMs: 60000 / this.definition.bpm, routes });
    // Use the ordinary Looper volume knob for accompaniment balance. Honk
    // trigger strength, synthesis gain behavior and release profiles stay normal.
    c.restoreState(h, { timeline: timeline.toJSON(), controls: { recordBeats: pattern.beats, gap: -1, volume: -.35 } }, { preserveConnections: true });
    this.expectedRevisions.set(h.id, h.looperData.takeRevision);
    this.expectedTakes.set(h.id, { timeline: h.timeline, json: JSON.stringify(h.timeline.toJSON()) });
  }
  showMelody(startBeat = 0, endBeat = this.definition.score.durationBeats) {
    const roles = new Set(this.definition.score.events.filter(e => e.beat >= startBeat && e.beat < endBeat).map(e => e.role));
    for (const recipe of this.definition.arrangement.recipes.filter(r => r.role.startsWith("lead-")))
      if (this.a.get(recipe.role)) this.a.get(recipe.role).root.visible = roles.has(recipe.role);
  }
  schedule({ countAt, beatZero, wallNow, audioNow, bpm = this.definition.bpm,
    startBeat = 0, endBeat = this.definition.score.durationBeats, origin = "performance" }) {
    this.cancel(); this.validate();
    this.startBeat = startBeat; this.endBeat = endBeat;
    this.blocks = this.definition.arrangement.blocks.filter(b => b.beat >= startBeat && b.beat < endBeat);
    this.snapshots = new Map(this.loopers.map(h => [h.id, structuredClone(h.looperController.serializeState(h))]));
    this.expectedRevisions = new Map(this.loopers.map(h => [h.id, h.looperData.takeRevision]));
    this.expectedTakes = new Map(this.loopers.map(h => [h.id, { timeline: h.timeline, json: JSON.stringify(h.timeline.toJSON()) }]));
    this.anchor = beatZero; this.origin = origin;
    this.clockStartBeat = (beatZero - countAt) / (60000 / bpm);
    this.originalSetBpm.call(this.metro, bpm);
    this.metro.beatOriginMs = null; this.metro.play(countAt);
    this.history = [{ atMs: countAt, beat: startBeat - this.clockStartBeat, bpm }];
    this.queuedIndex = 0; this.limited = false; this.handoffs = [];
    for (const [i, lane] of LANES.entries()) {
      const h = this.a.get(`${lane}-0`);
      this.loadPattern(h, this.blocks[0].patterns[i]);
      const c = h.looperController;
      if (!c.armPlayback(h, wallNow, c.getTimingForLooper(h, wallNow), {
        targetBeat: this.clockStartBeat, audioAnchor: { wallMs: wallNow, audioSeconds: audioNow }, origin,
      })) throw new Error("Backing could not start on the Metronome.");
    }
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
    for (const h of this.loopers) if (h.looperData.takeRevision !== this.expectedRevisions.get(h.id)) {
      this.cancel(); throw new Error("Looper recording activity stopped the arrangement. Your recordings are preserved.");
    }
    const beat = this.beatAt(now);
    const index = this.blocks.findLastIndex(b => beat >= b.beat);
    if (index >= 0 && beat >= this.blocks[index].beat + .25) {
      // Wait for the active bank to launch before requesting the next bank;
      // otherwise the port arbiter correctly treats it as replacing that launch.
      const active = LANES.map(lane => this.a.get(`${lane}-${index % 2}`));
      if (active.every(h => h.transport.playing) && this.queuedIndex === index) {
        const next = this.blocks[index + 1];
        if (next) {
          for (const [i, lane] of LANES.entries()) {
            const h = this.a.get(`${lane}-${(index + 1) % 2}`);
            this.loadPattern(h, next.patterns[i]);
            const c = h.looperController;
            if (!c.startPlayback(h, now, { origin: this.origin })) throw new Error("Backing handoff failed.");
          }
          this.queuedIndex = index + 1;
          this.handoffs.push({ from: this.blocks[index].id, to: next.id, beat: next.beat });
        } else if (!this.limited) {
          // Bound the last audio cycle in advance: a late rendering frame must
          // never schedule another first attack after the musical ending.
          for (const h of active) {
            const limit = h.timeline.durationMs;
            h.looperData.playbackLimitSourceMs = limit;
            h.looperController.trimPlaybackAtBoundary(h, limit, now);
          }
          this.limited = true;
        }
      }
    }
    if (beat >= this.endBeat) this.cancel();
  }
  cancel() {
    if (this.anchor !== null) this.stoppedBeat = this.beatAt(performance.now());
    this.anchor = null;
    const snapshots = this.snapshots;
    this.snapshots = null;
    for (const h of this.loopers) {
      if (h.disposed) continue;
      const c = h.looperController;
      const expected = this.expectedTakes.get(h.id);
      // Arming alone also increments the revision. Restore the original take
      // if no capture/replacement/clear actually changed the temporary timeline.
      const changed = h.looperData.takeRevision !== this.expectedRevisions.get(h.id) &&
        (h.timeline !== expected?.timeline || JSON.stringify(h.timeline.toJSON()) !== expected?.json);
      if (h.transport.recording || h.transport.recordArmed) c.stopRecording(h);
      c.stopPlayback(h);
      // Never replace a take the learner recorded/cleared during an attempt.
      if (snapshots?.has(h.id) && !changed) c.restoreState(h, snapshots.get(h.id), { restoreConnections: true });
      this.expectedRevisions.set(h.id, h.looperData.takeRevision);
      this.expectedTakes.set(h.id, { timeline: h.timeline, json: JSON.stringify(h.timeline.toJSON()) });
    }
    this.metro?.pause();
    this.a.releaseAll(); this.a.focus(null);
  }
  dispose() {
    this.cancel();
    if (this.metro && this.originalSetBpm) this.metro.setBpm = this.originalSetBpm;
    this.prepared = false;
  }
}
