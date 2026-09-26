import { compilePattern } from "../compositions/CompositionCompiler.js";
import {
  COMPOSITION as C,
  PITCHES,
  TUTORIAL_PRESETS,
  TUTORIAL_LOOPERS,
} from "../tutorial/composition.js";
import {
  connectTutorialClock,
  connectTutorialHonk,
  resolveTutorialRoutes,
} from "../tutorial/TutorialRoutes.js";
import { INSTRUMENT_BASE_SCALE } from "../config/honk.js";
import { applyMetronomeSpawnOrientation } from "../instruments/metronome/metronomeSpawnOrientation.js";

// Compile the canonical score into the same event format as live recording.
// No tutorial simulation, audio file, or melody playback is involved.
export function jogTimeline(role, routes) {
  return compilePattern({
    events:
      role === "percussionLooper"
        ? C.percussion
        : role === "alternativeLooper"
          ? C.alternateBacking
          : C.backing,
    beats: C.loopBeats,
    beatMs: C.beatMs,
    routes:
      role === "percussionLooper"
        ? routes.percussion
        : role === "alternativeLooper"
          ? routes.alternatives
          : routes.chords,
    defaults: { nose: C.backingNose, vowel: C.backingVowel },
  });
}

export class JogEnsemble {
  constructor(host) {
    this.host = host;
    this.r = host.r;
    this.a = host.adapter;
    this.prepared = false;
  }
  prepare() {
    this.prepared = false;
    for (const kind of ["honk", "looper", "metronome"])
      if (!this.r.componentTemplates.get(kind)?.template)
        throw new Error(`${kind} asset is not ready. Try Prepare again.`);
    this.a.clear();
    this.a.begin("performance");
    // Use the existing Jog formation recipes, metric scales and placement frame.
    for (const preset of TUTORIAL_PRESETS) {
      const members = this.r.formationSpawner.spawn(preset.id);
      if (members.length !== preset.midis.length)
        throw new Error(`Could not prepare ${preset.role}.`);
      this.a.roles.set(
        preset.role,
        members.map((h) => h.id),
      );
      this.a.bindings.set(preset.role, {
        source: "performance",
        entryId: preset.id,
      });
      members.forEach((h, i) => {
        this.r.setInstrumentBaseScale(h, INSTRUMENT_BASE_SCALE);
        h.root.position
          .applyQuaternion(this.a.layoutRotation)
          .add(this.a.positionFor(preset.role));
        h.root.quaternion.copy(this.a.layoutRotation);
        h.root.updateMatrixWorld(true);
        this.a.labelPresentation.styleNote(h);
        if (preset.role.startsWith("group-")) {
          h.setVowel(C.backingVowel);
          h.setNose(C.backingNose);
        }
        if (preset.role === "melody")
          this.a.roles.set(`melody-${Object.keys(PITCHES)[i]}`, [h.id]);
      });
      if (preset.role.startsWith("group-"))
        this.r.honkLockService.lockMembers(members.map((h) => h.id));
      this.a.labelPresentation.add(preset.role);
    }
    for (const { role, kind, scale } of [
      { role: "metronome", kind: "metronome", scale: 0.75 },
      ...TUTORIAL_LOOPERS.map((l) => ({
        role: l.role,
        kind: "looper",
        scale: 0.65,
      })),
    ]) {
      if (
        !this.r.createSpawnedComponent(kind, { name: role, baseScale: scale })
      )
        throw new Error(`Could not prepare ${role}.`);
      const h = this.r.activeInstrumentState;
      this.a.roles.set(role, [h.id]);
      this.a.bindings.set(role, { source: "performance", entryId: kind });
      h.root.position.copy(this.a.positionFor(role));
      h.root.quaternion.copy(this.a.layoutRotation);
      if (kind === "metronome")
        applyMetronomeSpawnOrientation(h.root, { relative: true });
      h.root.updateMatrixWorld(true);
      if (kind === "looper") this.r.syncLooperTransformReference(h);
      this.a.labelPresentation.add(role);
    }
    for (const { role } of TUTORIAL_LOOPERS) connectTutorialClock(this.a, role);
    for (const group of C.backing) connectTutorialHonk(this.a, group.role);
    connectTutorialHonk(this.a, "group-1", "alternativeLooper");
    connectTutorialHonk(this.a, "percussion");
    const routes = resolveTutorialRoutes(this.a);
    for (const { role } of TUTORIAL_LOOPERS) {
      const h = this.a.get(role),
        timeline = jogTimeline(role, routes);
      h.looperController.restoreState(
        h,
        {
          timeline: timeline.toJSON(),
          controls: {
            recordBeats: C.loopBeats,
            gap: -1,
            volume:
              role === "chordLooper" || role === "alternativeLooper"
                ? -0.55
                : 0,
          },
        },
        { preserveConnections: true },
      );
    }
    const metro = this.a.get("metronome");
    metro.setBpm(C.bpm);
    metro.setVolume(1);
    this.r.updateMetronomeLabel(metro);
    // Settle the existing geometric contact admission against deterministic
    // placement, so every recorded chord targets all three real Honks.
    for (
      let i = 0;
      i < this.r.honkContactSystem.settings.consecutiveEntryFrames;
      i++
    )
      this.r.honkContactSystem.update();
    this.prepared = true;
    this.reset();
    try {
      this.validate();
    } catch (error) {
      this.prepared = false;
      throw error;
    }
    this.a.labelPresentation.update();
  }
  validate() {
    if (!this.prepared) throw new Error("Prepare the ensemble first.");
    for (const preset of TUTORIAL_PRESETS) {
      const members = this.a.members(preset.role);
      if (
        members.length !== preset.midis.length ||
        members.some(
          (h, i) =>
            h.disposed ||
            h.pendingPlacement ||
            !h.isPlayable() ||
            Math.abs(this.a.midi(h) - preset.midis[i]) > 0.35,
        )
      )
        throw new Error(
          `Repair ${preset.role}: missing or retuned instrument.`,
        );
    }
    for (const preset of TUTORIAL_PRESETS) {
      const ids = this.a.ids(preset.role);
      for (const id of ids) {
        const expected = preset.role.startsWith("group-") ? ids : [id],
          actual = this.r.honkContactGraph.getConnectedComponent(id);
        if (
          actual.size !== expected.length ||
          expected.some((member) => !actual.has(member))
        )
          throw new Error(
            `Repair ${preset.role}: keep each chord together and separate it from other parts.`,
          );
      }
    }
    const routes = resolveTutorialRoutes(this.a),
      clocks = routes.clocks;
    if (
      !clocks.chordLooper ||
      !clocks.alternativeLooper ||
      !clocks.percussionLooper ||
      clocks.chordLooper.portId !== clocks.alternativeLooper.portId ||
      clocks.chordLooper.portId === clocks.percussionLooper.portId
    )
      throw new Error(
        "Repair the Jog clock connections or prepare the ensemble again.",
      );
    for (const { role } of TUTORIAL_LOOPERS) {
      const h = this.a.get(role),
        expected = jogTimeline(role, routes).toJSON();
      if (
        !h?.timeline.hasRecording() ||
        JSON.stringify(h.timeline.toJSON()) !== JSON.stringify(expected)
      )
        throw new Error(
          `Repair ${role}: accompaniment changed or missing. Prepare again.`,
        );
    }
    return true;
  }
  reset() {
    if (!this.prepared) return;
    // stop() clears scheduled voices, pending starts and port-group switches,
    // while retaining timelines, routes and every physical transform.
    for (const { role } of TUTORIAL_LOOPERS) this.a.get(role)?.stop();
    const metro = this.a.get("metronome");
    metro?.pause();
    if (metro) metro.beatOriginMs = null;
    this.a.releaseAll({ preserveSticks: true });
  }
  schedule({ countAt, beatZero, wallNow, audioNow }) {
    this.validate();
    const metro = this.a.get("metronome");
    metro.setBpm(C.bpm);
    metro.beatOriginMs = null;
    // The metronome supplies the grid; count-in has its own captured clicks.
    this.metroVolume = metro.volume;
    metro.setVolume(0);
    metro.play(countAt);
    const audioAnchor = { wallMs: wallNow, audioSeconds: audioNow };
    for (const role of ["chordLooper", "percussionLooper"]) {
      const h = this.a.get(role),
        controller = h.looperController;
      if (
        !controller.armPlayback(
          h,
          wallNow,
          controller.getTimingForLooper(h, wallNow),
          {
            targetBeat: (beatZero - countAt) / C.beatMs,
            audioAnchor,
            origin: "performance",
          },
        )
      )
        throw new Error(`Could not start ${role}.`);
    }
  }
  play() {
    if (this.metroVolume !== undefined)
      this.a.get("metronome")?.setVolume(this.metroVolume);
  }
  cancel() {
    this.reset();
    this.play();
  }
  update() {
    this.a.labelPresentation.update();
  }
}
