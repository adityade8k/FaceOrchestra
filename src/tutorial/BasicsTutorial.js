import { compilePattern } from "../compositions/CompositionCompiler.js";
import { connectTutorialClock, connectTutorialHonk } from "./TutorialRoutes.js";

export const BASICS_STEPS = [
  [
    "menu",
    "Show, hide, move and recenter the menu",
    "Click the LEFT thumbstick to hide and show. Point either controller at the header and hold Grip to move it. Release, then choose Recenter. Axes alone do not toggle.",
  ],
  [
    "place",
    "Place a Honk",
    "Hold right A or left Y, roll to Instruments, pull toward you, choose Honk and release. Trigger places; Grip cancels.",
  ],
  [
    "note",
    "Sustain, bend and release",
    "Squeeze the bottom sphere with Trigger. Hold for at least half a second, roll your wrist down or up to bend by at least one semitone, then release.",
  ],
  [
    "transform",
    "Move, scale and lock",
    "Grip a Honk to move it. Move the gripping thumbstick sideways to scale. Touch Honks to play a chord; right B locks or unlocks the connected group. Move and scale, then toggle a lock.",
  ],
  [
    "stick",
    "Make distinct strikes",
    "Grip in empty space to equip a stick. Strike a Honk, withdraw completely, then strike again. Continuous contact is one hit.",
  ],
  [
    "tempo",
    "Place the single metronome",
    "Place one Metronome from Instruments. Move its BPM handle to change tempo, then press Play. Only one Metronome is permitted.",
  ],
  [
    "connect",
    "Connect a looper and choose length",
    "Place a Looper. Drag a socket cable to your Honk, then a Metronome output to a free socket. The right handle chooses 2, 4, 8 or 16 beats; 16 is the default.",
  ],
  [
    "record",
    "Record, stop and play",
    "Press Record and play a short pattern. Silent waiting uses no beats. Stop finishes; Play starts it. A second idle Stop clears it. Re-recording replaces this pattern.",
  ],
  [
    "alternate",
    "Keep alternate patterns in separate loopers",
    "Record a different pattern in a second Looper. Connect both to the SAME Metronome output. Press Play on the other during playback: QUEUED waits for the valid cycle boundary.",
  ],
  [
    "parallel",
    "Use separate outputs for accompaniment",
    "Connect a recorded third Looper to a DIFFERENT output. Start it alongside one chord pattern. Separate outputs can play together.",
  ],
  [
    "finish",
    "Return to Play or choose a composition",
    "Exit restores your saved Play workspace. Home opens Tutorials and Record Songs. Hiding the menu keeps your session and transport running.",
  ],
].map(([id, title, instruction]) => ({ id, title, instruction }));

export class BasicsTutorial {
  constructor(host) {
    this.host = host;
    this.r = host.r;
    this.a = host.adapter;
    this.index = 0;
    this.outcomes = {};
    this.evidence = new Set();
    const progress = host.learningProgress.load("basics", 1);
    if (progress) {
      this.index = Math.min(10, progress.index || 0);
      this.outcomes = progress.outcomes || {};
    }
    this.feedback =
      "Demonstrate first, or Practice. Next skips without awarding mastery.";
  }
  get step() {
    return BASICS_STEPS[this.index];
  }
  placed(instruments) {
    if (this.demo) return;
    for (const h of instruments) {
      if (h.kind === "honk" && !this.a.get("basic"))
        this.a.roles.set("basic", [h.id]);
    }
    this.accept({ kind: "placed", origin: "learner" });
  }
  accept(event) {
    if (!this.practicing || this.demo || event.origin !== "learner") return;
    this.evidence.add(event.kind);
    if (
      event.kind === "note" &&
      event.released &&
      event.voiced &&
      event.endMs - event.startMs >= 500 &&
      event.maxAbsBend >= 1
    )
      this.evidence.add("sustain-bend-release");
    if (event.kind === "strike" && event.withdrawn)
      this.strikes = (this.strikes || 0) + 1;
  }
  snapshot() {
    const entities = [...this.r.instrumentRegistry.values()];
    return {
      honks: entities.filter((h) => h.kind === "honk"),
      loopers: entities.filter((h) => h.kind === "looper"),
      metro: entities.find((h) => h.kind === "metronome"),
      transforms: new Map(
        entities.map((h) => [
          h.id,
          {
            pose: `${h.root.position.toArray()}:${h.root.quaternion.toArray()}`,
            scale: h.baseScale,
          },
        ]),
      ),
      routing: JSON.stringify({
        clocks: this.r.metronomeConnectionManager.getConnections(),
        tracks: entities
          .filter((h) => h.kind === "looper")
          .map((h) => [h.id, h.tracks.map((t) => t.connectedHonkId)]),
      }),
      locks: JSON.stringify(this.r.honkLockService.serialize()),
    };
  }
  async action(id) {
    if (id === "exit") {
      await this.cancelDemo();
      if (this.step.id === "finish" && this.practicing) {
        this.outcomes.finish = "passed";
        this.persist();
      }
      return this.host.enterPlay();
    }
    if (id === "previous-step" || id === "next-step") {
      await this.cancelDemo();
      if (id === "next-step" && !this.outcomes[this.step.id])
        this.outcomes[this.step.id] = "skipped";
      this.index = Math.max(
        0,
        Math.min(
          BASICS_STEPS.length - 1,
          this.index + (id === "next-step" ? 1 : -1),
        ),
      );
      this.practicing = false;
      this.persist();
      this.feedback = "Demonstrate or Practice. Next skips this exercise.";
    } else if (id === "step-demo") {
      if (this.demo) await this.cancelDemo();
      else await this.demonstrate();
    } else if (id === "step-practice") {
      await this.cancelDemo();
      await this.r.audioSystem.ensureAudio();
      this.a.releaseAll();
      this.practicing = true;
      this.evidence.clear();
      this.strikes = 0;
      this.initial = this.snapshot();
      this.initialBpm = this.initial.metro?.bpm;
      this.wasQueued = this.initial.loopers.some((h) => h.looperData.queued);
      this.wasParallel =
        new Set(
          this.initial.loopers
            .filter((h) => h.transport.playing)
            .map(
              (h) =>
                this.r.metronomeConnectionManager.getConnectionForTarget(
                  "looper",
                  h.id,
                )?.portId,
            )
            .filter(Boolean),
        ).size >= 2;
      this.initialLengths = new Map(
        this.initial.loopers.map((h) => [h.id, h.looperData.recordBeats]),
      );
      this.initialTakes = new Map(
        this.initial.loopers.map((h) => [h.id, h.looperData.takeRevision]),
      );
      this.feedback =
        "Practice: perform the actions yourself. Only observed learner actions count.";
    }
  }
  persist() {
    this.host.learningProgress.save("basics", 1, {
      index: this.index,
      outcomes: this.outcomes,
    });
  }
  async demonstrate() {
    this.practicing = false;
    await this.r.audioSystem.ensureAudio();
    for (const looper of this.r.instrumentRegistry.getByKind("looper"))
      if (looper.transport.recording || looper.transport.recordArmed)
        this.r.pressLooperButton(looper, "stop", null, performance.now());
    this.a.releaseAll();
    const saved = this.r.sceneSerializer.serialize();
    this.demo = {
      saved,
      at: performance.now(),
      roles: new Map(this.a.roles),
      pose: {
        position: this.host.panel.group.position.clone(),
        quaternion: this.host.panel.group.quaternion.clone(),
        scale: this.host.panel.group.scale.clone(),
      },
    };
    this.feedback =
      "Demonstration. Your practice scene and recordings return when the example ends.";
    this.a.releaseAll();
    this.a.setVirtualsActive(true, "demonstration");
    if (["menu", "finish"].includes(this.step.id)) return;
    this.a.clear();
    this.a.begin("demonstration");
    this.a.setVirtualsActive(true, "demonstration");
    const ensure = (kind, role, x, y) => {
      if (this.a.get(role)) return this.a.get(role);
      if (kind === "metronome") {
        const existing = this.r.instrumentRegistry.getByKind("metronome")[0];
        if (existing) {
          this.a.roles.set(role, [existing.id]);
          return existing;
        }
      }
      this.r.createSpawnedComponent(kind, {
        name: role,
        baseScale: kind === "honk" ? 1.6 : 0.65,
      });
      const h = this.r.activeInstrumentState;
      h.root.position.copy(this.a.anchor);
      h.root.position.x += x;
      h.root.position.y += y;
      this.a.roles.set(role, [h.id]);
      h.root.updateMatrixWorld(true);
      return h;
    };
    ensure("honk", "basic", 0, 0.2);
    if (this.step.id === "transform") {
      const first = this.a.get("basic"),
        second = ensure("honk", "basic-chord-member", 0.1, 0.2);
      this.r.honkLockService.lockMembers([first.id, second.id]);
    }
    if (
      ["tempo", "connect", "record", "alternate", "parallel"].includes(
        this.step.id,
      )
    ) {
      ensure("metronome", "metronome", -0.55, -0.25);
      const m = this.a.get("metronome");
      m.setBpm(80);
      m.play(performance.now());
      this.r.updateMetronomeLabel(m);
    }
    if (["connect", "record", "alternate", "parallel"].includes(this.step.id)) {
      const count =
        this.step.id === "parallel" ? 3 : this.step.id === "alternate" ? 2 : 1;
      for (const [i, role] of [
        "chordLooper",
        "alternativeLooper",
        "percussionLooper",
      ]
        .slice(0, count)
        .entries()) {
        const h = ensure("looper", role, -0.3 + i * 0.3, -0.25);
        connectTutorialClock(this.a, role);
        const track = connectTutorialHonk(this.a, "basic", role);
        this.r.setLooperControlValue(h, "recordLength", -1);
        if (this.step.id === "record") {
          this.r.pressLooperButton(
            h,
            "record",
            null,
            performance.now(),
            "demonstration",
          );
        } else if (this.step.id !== "connect") {
          const pattern = compilePattern({
            events: [{ role: "basic", beat: 0, beats: i === 1 ? 0.25 : 1 }],
            beats: 2,
            beatMs: 750,
            routes: {
              basic: { trackId: track.trackId, trackIndex: track.index },
            },
          });
          h.looperController.restoreState(
            h,
            {
              timeline: pattern.toJSON(),
              controls: { recordBeats: 2, gap: -1, volume: 0 },
            },
            { preserveConnections: true },
          );
          if (i !== 1)
            this.r.pressLooperButton(
              h,
              "play",
              null,
              performance.now(),
              "demonstration",
            );
        }
      }
    }
    if (this.step.id === "stick") this.a.equip(true, "demonstration");
  }
  async cancelDemo() {
    const demo = this.demo;
    if (!demo) return;
    this.demo = null;
    this.a.setVirtualsActive(false);
    this.a.releaseAll();
    Object.entries(demo.pose).forEach(([key, value]) =>
      this.host.panel.group[key].copy(value),
    );
    this.host.panel.group.updateMatrixWorld(true);
    if (["menu", "finish"].includes(this.step.id)) {
      this.feedback =
        "Use Menu to hide/show; grip the header to move. Recenter restores its initial view. Exit returns to Play.";
      return;
    }
    this.a.clear();
    await this.r.sceneRestorer.restore(demo.saved);
    this.a.roles = demo.roles;
    this.feedback =
      "Example complete. Practice recordings preserved. Choose Practice to earn credit.";
  }
  update(now) {
    if (this.demo) {
      const t = (now - this.demo.at) / 1000,
        h = this.a.get("basic");
      if (this.step.id === "menu") {
        this.host.panel.group.position.copy(this.demo.pose.position);
        this.host.panel.group.position.x +=
          Math.sin((t * Math.PI) / 2.5) * 0.18;
        this.host.panel.group.updateMatrixWorld(true);
        this.feedback =
          "Example: the header moves the whole panel while preserving its readable plane. Your thumbstick hides/shows it; Recenter returns it in front of you.";
      }
      if (this.step.id === "note")
        this.a.squeeze("basic", t < 2.5, t > 0.5 ? -Math.min(2, t) : 0, now);
      if (this.step.id === "stick")
        this.a.moveStick("basic", Math.max(0, Math.sin(t * Math.PI * 2)));
      if (this.step.id === "record") {
        this.a.squeeze("basic", t >= 0.2 && t < 1.1, 0, now);
        const looper = this.a.get("chordLooper");
        if (t > 1.3 && !this.demo.stopped) {
          this.demo.stopped = true;
          if (looper.transport.recording || looper.transport.recordArmed)
            this.r.pressLooperButton(
              looper,
              "stop",
              null,
              now,
              "demonstration",
            );
        }
        if (t > 1.7 && !this.demo.played && looper.timeline.hasRecording()) {
          this.demo.played = true;
          this.r.pressLooperButton(looper, "play", null, now, "demonstration");
        }
      }
      if (this.step.id === "transform" && h) {
        h.root.position.x = this.a.anchor.x + Math.sin(t) * 0.2;
        this.r.setInstrumentBaseScale(h, 1.6 + 0.2 * Math.sin(t));
      }
      if (this.step.id === "alternate" && t > 1 && !this.demo.switched) {
        this.demo.switched = true;
        this.r.pressLooperButton(
          this.a.get("alternativeLooper"),
          "play",
          null,
          now,
          "demonstration",
        );
      }
      if (t > 5)
        this.cancelDemo().catch((error) => {
          this.feedback = error.message;
        });
      return;
    }
    if (!this.practicing) return;
    const s = this.snapshot(),
      clocks = s.loopers
        .map((h) =>
          this.r.metronomeConnectionManager.getConnectionForTarget(
            "looper",
            h.id,
          ),
        )
        .filter(Boolean);
    for (const [id, transform] of s.transforms) {
      const initial = this.initial.transforms.get(id);
      if (!initial) {
        this.initial.transforms.set(id, transform);
        continue;
      }
      if (transform.pose !== initial.pose) this.evidence.add("moved");
      if (transform.scale !== initial.scale) this.evidence.add("scaled");
    }
    if (s.locks !== this.initial.locks) this.evidence.add("locked");
    if (s.routing !== this.initial.routing) this.evidence.add("wired");
    for (const h of s.loopers) {
      if (!this.initialLengths.has(h.id))
        this.initialLengths.set(h.id, h.looperData.recordBeats);
      if (h.looperData.recordBeats !== this.initialLengths.get(h.id))
        this.evidence.add("length-changed");
    }
    if (s.metro) {
      this.initialBpm ??= s.metro.bpm;
      if (s.metro.bpm !== this.initialBpm) this.evidence.add("tempo-changed");
    }
    const queued = s.loopers.some((h) => h.looperData.queued);
    const parallel =
      new Set(
        s.loopers
          .filter((h) => h.transport.playing)
          .map((h) => clocks.find((c) => c.targetId === h.id)?.portId)
          .filter(Boolean),
      ).size >= 2;
    if (queued && !this.wasQueued) this.evidence.add("queued");
    if (parallel && !this.wasParallel) this.evidence.add("parallel-started");
    this.wasQueued = queued;
    this.wasParallel = parallel;
    const ok = {
      menu: ["menu.hide", "menu.show", "menu.move", "menu.recenter"].every(
        (e) => this.evidence.has(e),
      ),
      place:
        this.evidence.has("placed") &&
        s.honks.length > this.initial.honks.length,
      note: this.evidence.has("sustain-bend-release"),
      transform: ["moved", "scaled", "locked"].every((e) =>
        this.evidence.has(e),
      ),
      stick: this.strikes >= 2,
      tempo: Boolean(s.metro?.playing && this.evidence.has("tempo-changed")),
      connect:
        this.evidence.has("wired") &&
        this.evidence.has("length-changed") &&
        clocks.length > 0 &&
        s.loopers.some((h) => h.tracks.some((t) => t.connectedHonkId)),
      record: s.loopers.some(
        (h) =>
          h.timeline.hasRecording() &&
          h.transport.playing &&
          h.looperData.takeRevision !== this.initialTakes.get(h.id),
      ),
      alternate:
        s.loopers.filter((h) => h.timeline.hasRecording()).length >= 2 &&
        new Set(clocks.map((c) => c.portId)).size < clocks.length &&
        this.evidence.has("queued"),
      parallel: parallel && this.evidence.has("parallel-started"),
      finish: false,
    }[this.step.id];
    if (ok) {
      this.outcomes[this.step.id] = "passed";
      this.practicing = false;
      this.feedback =
        "Observed successfully. Next continues; Practice retries.";
      this.persist();
    }
  }
  model() {
    const b = (id, label, disabled = false) => ({ id, label, disabled });
    return {
      visible: true,
      title: this.step.title,
      instruction: this.step.instruction,
      feedback: this.feedback,
      progress: `BASICS · ${this.index + 1}/${BASICS_STEPS.length}`,
      navigation: [
        b("previous-step", "Previous", this.index === 0),
        b("next-step", "Next / Skip", this.index === BASICS_STEPS.length - 1),
        b("step-demo", this.demo ? "Stop Example" : "Demonstrate"),
        b("step-practice", "Practice / Retry", Boolean(this.demo)),
      ],
      actions: [b("recenter", "Recenter"), b("exit", "Exit")],
    };
  }
  dispose() {
    this.practicing = false;
    this.demo = null;
    this.a.releaseAll();
  }
}
