import { validateComposition } from "./CompositionRegistry.js";
import { tuningForMidi } from "../tutorial/composition.js";
import { compilePattern } from "./CompositionCompiler.js";
import { validateDataArrangement } from "./DataValidation.js";
import { Quaternion } from "three";

export class DataEnsemble {
  constructor(host, definition) {
    this.host = host;
    this.r = host.r;
    this.a = host.adapter;
    this.definition = definition;
  }
  prepare() {
    validateDataArrangement(validateComposition(this.definition));
    const recipes = this.definition.arrangement.recipes;
    if (
      !Array.isArray(recipes) ||
      recipes.some(
        (r) =>
          !r.role ||
          !["honk", "looper", "metronome"].includes(r.kind) ||
          !r.position?.every(Number.isFinite),
      )
    )
      throw new Error("Invalid instrument recipe");
    this.a.clear();
    this.a.begin("learner");
    for (const recipe of recipes) {
      if (
        !this.r.createSpawnedComponent(recipe.kind, {
          name: recipe.role,
          baseScale: recipe.scale,
          ...(recipe.midi === undefined
            ? {}
            : { tuning: tuningForMidi(recipe.midi) }),
        })
      )
        throw new Error(`Cannot prepare ${recipe.role}`);
      const h = this.r.activeInstrumentState;
      h.root.position
        .fromArray(recipe.position)
        .applyQuaternion(this.a.layoutRotation)
        .add(this.a.anchor);
      h.root.quaternion.copy(this.a.layoutRotation);
      if (recipe.orientation)
        h.root.quaternion.multiply(
          new Quaternion().fromArray(recipe.orientation),
        );
      h.root.updateMatrixWorld(true);
      this.a.roles.set(recipe.role, [h.id]);
      if (h.kind === "honk") this.a.labelPresentation.styleNote(h);
      if (h.kind === "looper") this.r.syncLooperTransformReference(h);
    }
    const metro = this.a.get("metronome"),
      outputs = new Map(),
      usedGroups = new Set();
    this.initialPatterns = new Set();
    for (const pattern of this.definition.arrangement.backing || []) {
      const h = this.a.get(pattern.role),
        routes = {};
      const group = pattern.outputGroup || pattern.role;
      if (!outputs.has(group))
        outputs.set(group, [...metro.connectionPorts.keys()][outputs.size]);
      const clock = h.tracks[0];
      this.r.metronomeConnectionManager.connect({
        metronomeId: metro.id,
        portId: outputs.get(group),
        targetKind: "looper",
        targetId: h.id,
        targetPortId: clock.trackId,
      });
      for (const role of new Set(pattern.events.map((e) => e.role))) {
        const track = h.tracks.find((t) => t !== clock && !t.connectedHonkId);
        this.r.connectLooperTrackToHonk(h, track.index, this.a.get(role).id);
        routes[role] = {
          trackId: track.trackId,
          trackIndex: track.index,
        };
      }
      const timeline = compilePattern({
        ...pattern,
        routes,
        beatMs: 60000 / this.definition.bpm,
      });
      h.looperController.restoreState(
        h,
        {
          timeline: timeline.toJSON(),
          controls: { recordBeats: pattern.beats, gap: -1, volume: 0 },
        },
        { preserveConnections: true },
      );
      if (!usedGroups.has(group) && pattern.start !== false) {
        usedGroups.add(group);
        this.initialPatterns.add(pattern.role);
      }
    }
    this.prepared = true;
    this.validate();
  }
  validate() {
    if (!this.prepared) throw new Error("Prepare ensemble first");
    for (const recipe of this.definition.arrangement.recipes) {
      const h = this.a.get(recipe.role);
      if (
        !h ||
        h.disposed ||
        (recipe.midi !== undefined &&
          Math.abs(this.a.midi(h) - recipe.midi) > 0.25)
      )
        throw new Error(`Repair ${recipe.role}: missing or retuned target`);
    }
    return true;
  }
  cancel() {
    this.anchor = null;
    this.a.releaseAll();
    this.a.stopSound();
  }
  schedule({ countAt, beatZero, wallNow, audioNow }) {
    this.validate();
    this.anchor = beatZero;
    const metro = this.a.get("metronome");
    if (metro) {
      metro.setBpm(this.definition.bpm);
      metro.beatOriginMs = null;
      metro.play(countAt);
    }
    for (const pattern of this.definition.arrangement.backing || []) {
      if (!this.initialPatterns.has(pattern.role)) continue;
      const h = this.a.get(pattern.role),
        c = h.looperController;
      c.armPlayback(h, wallNow, c.getTimingForLooper(h, wallNow), {
        targetBeat: (beatZero - countAt) / (60000 / this.definition.bpm),
        audioAnchor: { wallMs: wallNow, audioSeconds: audioNow },
        origin: "performance",
      });
    }
  }
  play() {}
  update(now) {
    if (this.anchor == null) return;
    const time = (now - this.anchor) / 1000;
    const event = this.definition.score.events.find(
      (e) =>
        time >= e.startSeconds - 0.2 &&
        time < e.startSeconds + e.durationSeconds,
    );
    this.a.focus(event?.role);
  }
}
export class DataGuidance {
  constructor(definition, anchor) {
    this.definition = definition;
    this.anchorMs = anchor;
    this.beatMs = 1000;
    this.step = {
      type: "data",
      timed: true,
      beats: definition.score.durationSeconds,
      events: definition.score.events.map((e) => ({
        ...e,
        beat: e.startSeconds,
        beats: e.durationSeconds,
        bend: e.bend?.map((p) => ({
          fraction: p.seconds / e.durationSeconds,
          semitones: p.semitones,
        })),
      })),
    };
  }
  beatAt(now) {
    return (now - this.anchorMs) / 1000;
  }
  complete(now) {
    return (
      (now - this.anchorMs) / 1000 >= this.definition.score.durationSeconds
    );
  }
  model(now) {
    const time = (now - this.anchorMs) / 1000;
    const next = this.definition.score.events.find(
      (e) => e.startSeconds + e.durationSeconds > time,
    );
    const active = next && time >= next.startSeconds;
    const bend = next?.bend?.find((p) => p.seconds >= time - next.startSeconds);
    return {
      transport:
        time < 0
          ? `Count in: ${Math.ceil(-time / (60 / this.definition.bpm))}`
          : active
            ? "Hold, then release"
            : "Release · rest",
      instruction: next
        ? `MIDI ${next.midi} · ${next.durationSeconds.toFixed(2)} seconds${bend?.semitones ? ` · roll ${bend.semitones < 0 ? "down" : "up"} ${Math.abs(bend.semitones).toFixed(1)} semitones` : " · neutral wrist"}`
        : "Complete. Stop Recording when ready.",
      feedback:
        "Only your live melody is captured as your performance. Follow the onset and duration cues.",
    };
  }
}
