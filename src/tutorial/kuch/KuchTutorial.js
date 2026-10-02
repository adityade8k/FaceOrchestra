import { KuchLayout } from "./KuchLayout.js";
import { PracticeProgress } from "./PracticeProgress.js";
import { kuchTiming, practiceBpm } from "./timing.js";
import { prepareKuchBacking, restoreKuchBacking } from "./prepareBacking.js";
import { validateSwitchExercise } from "../validation.js";
import { bendAt } from "../composition.js";
import {
  BPM,
  SECTION_VERSION,
  PRACTICE_BREAKS,
  PITCHES,
  PATTERN_CHANGES,
  noteName,
  assess,
} from "./score.js";
import {
  kuchArrangement,
  createKuchGuidance,
  gestureInstruction,
  KUCH_CONTENT_VERSION,
} from "./arrangements.js";

// Uses the shared tutorial's real controller, contact, recorder and audio paths.
// INPUT selects patterns; the shared application audio transport owns handoffs.
const PATTERN_ROLES = { D: "chordLooper", change: "alternativeLooper" };
const LOOPER_ROLES = ["chordLooper", "alternativeLooper", "percussionLooper"];
export class KuchTutorial extends KuchLayout {
  constructor(host, arrangement = kuchArrangement()) {
    super(host);
    this.host = host;
    this.r = host.r;
    this.a = host.adapter;
    this.index = 0;
    this.heard = [];
    this.arrangement = arrangement;
    this.steps = arrangement.steps;
    this.progressId = `kuch-to-hua-hai:${arrangement.id}`;
    this.progressVersion = `${KUCH_CONTENT_VERSION}:${arrangement.version}:sections-${SECTION_VERSION}`;
    this.practiceProgress = new PracticeProgress();
    this.timing = kuchTiming();
    this.guide = null;
    this.unsubscribeRegistry = this.r.instrumentRegistry?.subscribe((event) => {
      if (
        !this.disposed &&
        this.phase &&
        event.type === "instrument.removed" &&
        this.phaseTargets?.has(event.instrumentId)
      )
        this.cancel(
          "A required instrument was removed. Restore the setup and restart.",
        );
    });
    this.queue = [];
    this.phase = null;
    this.note = null;
    this.lastNow = null;
    this.feedback =
      "Choose Demonstrate to listen, then Practice to try it. Next Step skips an exercise.";
    this.labels = [];
    this.buttons = [];
    this.results = {};
    this.report = null;
    this.desktopRole = null;
    this.desktopStrike = null;
  }
  setup() {
    super.setup();
    this.controls();
    const metro = this.a.get("metronome");
    this.setMetroBpm = metro.setBpm.bind(metro);
    this.originalSetBpm = metro.setBpm;
    metro.setBpm = (value) =>
      this.isPracticeSection()
        ? this.setPracticeTempo(value)
        : this.setMetroBpm(value);
    this.applyTempo();
  }
  controls() {
    this.dom = document.createElement("aside");
    this.dom.className = "kuch-keyboard";
    this.dom.setAttribute("aria-label", "Kuch To Hua Hai instruments");
    const info = document.createElement("p");
    info.textContent =
      "Hold a steady note or chord; tap a drum. Use XR for held-bend practice: Trigger holds the sphere; wrist roll bends pitch; Grip equips the stick.";
    this.dom.append(info);
    const add = (role, label, drum = false) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.dataset.role = role;
      const press = (e) => {
        if (this.phase && !this.phase.learner) return;
        e.preventDefault();
        if (e.pointerId !== undefined) b.setPointerCapture(e.pointerId);
        this.a.setVirtualsActive(true, "learner");
        if (drum) {
          if (!this.desktopStrike) {
            this.a.equip(true, "learner");
            this.desktopStrike = { role, at: performance.now() };
          }
        } else {
          this.desktopRole = role;
          this.playNote({ role }, performance.now());
        }
      };
      b.addEventListener("pointerdown", press);
      const release = () => {
        if (this.desktopRole === role) {
          this.desktopRole = null;
          this.playNote(null, performance.now());
        }
      };
      b.addEventListener("pointerup", release);
      b.addEventListener("pointercancel", release);
      b.addEventListener("lostpointercapture", release);
      b.addEventListener("keydown", (e) => {
        if ([" ", "Enter"].includes(e.key) && !e.repeat) press(e);
      });
      b.addEventListener("keyup", (e) => {
        if ([" ", "Enter"].includes(e.key)) {
          e.preventDefault();
          release();
        }
      });
      b.addEventListener("blur", release);
      this.dom.append(b);
      this.buttons.push(b);
    };
    add("D", "D major");
    add("C", "C major");
    PITCHES.forEach((m) => add(`lead-${m}`, noteName(m)));
    add("percussion", "Boink", true);
    add("percussionLooper", "Hihat", true);
    document.body.append(this.dom);
    this.blur = () => {
      if (this.phase?.learner || this.desktopRole || this.desktopStrike)
        this.cancel(
          "Window lost focus. Choose Demonstrate or Practice for a fresh count-in.",
        );
    };
    window.addEventListener("blur", this.blur);
  }
  get step() {
    return this.steps[this.index];
  }
  get running() {
    return Boolean(this.phase || this.queue.length);
  }
  get demonstrating() {
    return Boolean(this.phase && !this.phase.learner);
  }
  accept(event) {
    if (this.phase) this.heard.push(event);
  }
  take(role) {
    const h = this.a.get(role);
    return structuredClone(h.looperController.serializeState(h));
  }
  restore(role, take) {
    const h = this.a.get(role);
    if (h)
      h.looperController.restoreState(h, structuredClone(take), {
        preserveConnections: true,
      });
  }
  ready() {
    return LOOPER_ROLES.every((role) =>
      this.a.get(role)?.timeline.hasRecording(),
    );
  }
  isPracticeSection(step = this.step) {
    return ["melody", "performance"].includes(step.kind);
  }
  selectedBpm() {
    return this.isPracticeSection()
      ? this.practiceProgress.section(this.step.id).bpm
      : BPM;
  }
  applyTempo() {
    const bpm = this.selectedBpm();
    const metro = this.a.get("metronome");
    if (!this.r.capture?.active) this.setMetroBpm?.(bpm);
    this.r.updateMetronomeLabel(metro);
    this.timing = kuchTiming(metro.bpm ?? bpm);
  }
  setPracticeTempo(value) {
    if (this.disposed || this.r.capture?.active)
      return this.a.get("metronome").bpm;
    const bpm = practiceBpm(value);
    if (bpm === this.selectedBpm() && bpm === this.a.get("metronome").bpm)
      return bpm;
    const restart = Boolean(this.phase?.learner);
    const step = this.step;
    this.cancel();
    this.practiceProgress.select(step.id, bpm);
    this.applyTempo();
    this.persist();
    if (restart) this.start(step, true);
    else
      this.feedback = `Ready at ${bpm} BPM. Choose Practice for a fresh count-in.`;
    this.host.render(performance.now());
    return bpm;
  }
  persist() {
    this.host.learningProgress?.save(this.progressId, this.progressVersion, {
      index: this.index,
      results: this.results,
      practice: this.practiceProgress.export(),
    });
  }
  prepareBacking() {
    this.backingSnapshots ||= new Map();
    prepareKuchBacking(this.a, {
      preserveExisting: true,
      snapshots: this.backingSnapshots,
    });
  }
  quickPractice() {
    if (this.disposed || this.r.capture?.active) return;
    this.cancel();
    this.prepareBacking();
    this.index = this.steps.length - 1;
    this.applyTempo();
    this.feedback =
      "Backing ready. Play the melody live; choose Start Practice for a four-beat count-in.";
  }
  async action(id) {
    if (this.disposed) return;
    if (id.startsWith("practice-bpm:")) {
      this.setPracticeTempo(Number(id.split(":")[1]));
      return;
    }
    if (id === "progressive-practice") {
      this.practiceProgress.enabled = !this.practiceProgress.enabled;
      this.persist();
    }
    if (id === "kuch-quick-practice") this.quickPractice();
    if (id === "exit") {
      await this.host.enterPlay();
      return;
    }
    if (id === "recenter") {
      this.host.panel.recenter(this.r.getUserCamera(), true);
      return;
    }
    if (
      ["play-chordLooper", "play-alternativeLooper"].includes(id) &&
      this.phase?.learner &&
      this.phase.kind === "switch"
    ) {
      this.a.command(id, performance.now(), "learner");
      return;
    }
    if (id === "previous-step" || id === "next-step") {
      this.cancel();
      this.index = Math.max(
        0,
        Math.min(
          this.steps.length - 1,
          this.index + (id === "next-step" ? 1 : -1),
        ),
      );
      this.applyTempo();
      this.feedback = "Demonstrate or Practice. Next Step skips this exercise.";
    } else if (id === "step-demo" || id === "step-practice") {
      if (this.running) {
        this.cancel("Stopped. Choose an action for a fresh count-in.");
        return;
      }
      if (this.starting) return;
      this.starting = true;
      const generation = this.actionGeneration;
      try {
        await this.r.audioSystem.ensureAudio();
      } finally {
        this.starting = false;
      }
      if (generation !== this.actionGeneration) return;
      if (this.disposed || this.host.kuch !== this) return;
      if (
        id === "step-practice" &&
        this.step.kind === "switch" &&
        !this.ready()
      ) {
        this.feedback =
          "Record D major, C → D, and the stick groove with Practice first.";
        return;
      }
      if (this.isPracticeSection()) this.prepareBacking();
      this.start(this.step, id === "step-practice");
    }
    this.host.render(performance.now());
  }
  start(step, learner = false, { full = false } = {}) {
    this.cancel();
    this.applyTempo();
    this.heard = [];
    this.report = null;
    // A full example may need temporary backing recordings. Preserve every learner take.
    if (
      !learner &&
      (full || (["performance", "switch"].includes(step.kind) && !this.ready()))
    ) {
      this.saved = Object.fromEntries(
        LOOPER_ROLES.map((role) => [role, this.take(role)]),
      );
      this.queue = [
        ...this.steps
          .slice(0, 3)
          .map((s) => ({ ...s, learner: false, record: true })),
        ...(full
          ? [this.steps.find((s) => s.kind === "switch"), this.steps.at(-1)]
          : [step]
        ).map((s) => ({ ...s, learner: false })),
      ];
    } else
      this.queue = [
        {
          ...step,
          learner,
          record: learner && ["chords", "drums"].includes(step.kind),
        },
      ];
    this.full = full;
    this.feedback = learner
      ? "Practice: follow the beat and highlighted target."
      : "Demonstration: watch the squeezes, releases and stick contacts.";
    const metro = this.a.get("metronome");
    metro.beatOriginMs = null;
    const now = performance.now();
    if (!metro.playing) metro.pressButton("play", now);
    this.next(now);
  }
  next(now) {
    this.guide = null;
    this.host.cues?.reset();
    this.phase = this.queue.shift() || null;
    this.note = null;
    this.phaseAssessed = false;
    this.activePattern = null;
    this.switchStage = 0;
    this.switchAttempt = {
      origin: this.phase?.learner ? "learner" : "demonstration",
      enteredAt: now,
      switchQueued: new Set(),
    };
    this.lastNow = now;
    if (!this.phase) {
      this.finish();
      return;
    }
    this.heard = [];
    this.a.releaseVirtuals();
    this.a.setVirtualsActive(
      !this.phase.learner,
      !this.phase.learner ? "demonstration" : "learner",
    );
    const metro = this.a.get("metronome"),
      timing = metro.getBeatTiming(now);
    this.anchor =
      timing.beatOriginMs +
      Math.ceil((now - timing.beatOriginMs) / this.timing.beatMs + 4) *
        this.timing.beatMs;
    this.anchorBeat = (this.anchor - timing.beatOriginMs) / this.timing.beatMs;
    this.timing = kuchTiming(metro.bpm ?? this.timing.bpm, this.anchor);
    this.guide = createKuchGuidance(
      this.phase,
      this.anchor,
      this.phase.learner ? "practice" : "demonstration",
      this.timing,
    );
    const roles = new Set([
      ...this.phase.events.map((e) => e.role),
      "metronome",
      ...LOOPER_ROLES,
    ]);
    this.phaseTargets = new Set(
      [...roles].flatMap(
        (role) => this.a.ids?.(role) || [this.a.get(role)?.id].filter(Boolean),
      ),
    );
    if (this.phase.record) {
      this.recordRole =
        this.phase.kind === "drums"
          ? "percussionLooper"
          : PATTERN_ROLES[this.phase.pattern];
      if (this.phase.learner && this.backingSnapshots?.has(this.recordRole)) {
        this.restore(
          this.recordRole,
          this.backingSnapshots.get(this.recordRole),
        );
        this.backingSnapshots.delete(this.recordRole);
      }
      // Cancel restores this exact pre-attempt take, including its connections.
      this.attemptTake = this.take(this.recordRole);
      this.r.pressLooperButton(
        this.a.get(this.recordRole),
        "record",
        null,
        now,
      );
    }
    if (this.phase.kind === "drums" && !this.phase.learner)
      this.a.equip(true, "demonstration");
    if (
      (["melody", "performance"].includes(this.phase.kind) ||
        this.phase.kind === "switch") &&
      this.ready()
    ) {
      this.activePattern =
        this.phase.kind === "switch"
          ? "D"
          : (this.phase.backingChanges || PATTERN_CHANGES)[0][1];
      const roles =
        this.phase.kind === "switch"
          ? [PATTERN_ROLES[this.activePattern]]
          : [PATTERN_ROLES[this.activePattern], "percussionLooper"];
      for (const role of roles) {
        const h = this.a.get(role);
        h.looperController.armPlayback(
          h,
          now,
          h.looperController.getTimingForLooper(h, now),
          { targetBeat: this.anchorBeat, origin: "demonstration" },
        );
      }
    }
  }

  playNote(note, now) {
    const id = note?.id || note?.role || null;
    if (id !== this.note) {
      this.a.squeeze(null, false, 0, now);
      // A same-frame release/onset must pass through the normal live voice path.
      this.r.updateHorn(now);
      this.a.observe(now);
      this.note = id || null;
    }
    if (note)
      this.a.squeeze(
        note.role,
        true,
        bendAt(
          note.bend,
          ((now - this.anchor) / this.timing.beatMs - note.beat) / note.beats,
        ),
        now,
      );
  }
  strike(pattern, beat) {
    const hit = pattern.find(
      (e) => beat >= e.beat - 0.3 && beat < e.beat + 0.32,
    );
    if (!hit) {
      this.a.park(this.a.virtuals[1]);
      return;
    }
    const t = beat - hit.beat;
    this.a.moveStick(
      hit.role,
      t < 0
        ? (0.82 * (t + 0.3)) / 0.3
        : t <= 0.08
          ? 0.82 + (0.18 * t) / 0.08
          : Math.max(0, 1 - (t - 0.08) / 0.24),
    );
  }
  update(now) {
    if (this.desktopStrike) {
      const elapsed = now - this.desktopStrike.at;
      this.strike(
        [{ role: this.desktopStrike.role, beat: 0.3 }],
        elapsed / this.timing.beatMs,
      );
      if (elapsed > this.timing.beatMs * 0.7) {
        this.a.park(this.a.virtuals[1]);
        this.desktopStrike = null;
      }
    }
    if (!this.phase) return;
    const audioState = this.r.audioSystem.audioContextService?.context?.state;
    if (audioState && audioState !== "running") {
      this.cancel("Audio paused. Restart for a fresh count-in.");
      return;
    }
    if (
      this.lastNow !== null &&
      this.lastNow >= this.anchor &&
      now - this.lastNow > 500
    ) {
      this.cancel(
        "Playback paused after a delayed frame. Restart for a fresh count-in.",
      );
      return;
    }
    this.lastNow = now;
    const p = this.phase,
      beat = (now - this.anchor) / this.timing.beatMs;
    if (p.kind === "switch") {
      const a = this.a.get("chordLooper"),
        b = this.a.get("alternativeLooper");
      const phase = (h) =>
        (h.looperController.getAbsoluteSourcePosition(h, now) %
          h.timeline.durationMs) /
        h.timeline.durationMs;
      if (!p.learner) {
        if (this.switchStage === 0 && a.transport.playing && phase(a) > 0.25) {
          this.a.command("play-alternativeLooper", now, "demonstration");
          this.switchStage = 1;
        }
        if (this.switchStage === 1 && b.transport.playing && phase(b) > 0.25) {
          this.a.command("play-chordLooper", now, "demonstration");
          this.switchStage = 2;
        }
      }
      const checked = validateSwitchExercise(
        this.a.snapshot(now),
        this.switchAttempt,
      );
      this.feedback = checked.message;
      if (checked.ok) {
        if (p.learner) this.results[p.id] = checked;
        this.report = {
          step: p.id,
          origin: p.learner ? "learner" : "demonstration",
          result: checked,
          completed: true,
        };
        for (const role of LOOPER_ROLES) this.a.get(role).stop();
        this.next(now);
      } else if (beat > 100)
        this.cancel(
          "Choose Practice and try selecting the other pattern mid-cycle, then switch back.",
        );
      return;
    }
    if (
      ["melody", "performance"].includes(p.kind) &&
      this.ready() &&
      beat >= 0 &&
      beat < p.beats
    ) {
      // Select four beats before the written change. The real port arbiter,
      // including its audio lookahead, owns the eventual boundary handoff.
      const upcoming = (p.backingChanges || PATTERN_CHANGES).find(
        ([at]) => at > beat && at - beat <= 4,
      );
      if (upcoming && upcoming[1] !== this.activePattern) {
        const h = this.a.get(PATTERN_ROLES[upcoming[1]]);
        h.looperController.startPlayback(h, now, { origin: "demonstration" });
        this.activePattern = upcoming[1];
      }
    }
    if (!p.learner) {
      // Leave a small articulation gap in chord strums; lead durations remain the MIDI durations.
      const note =
        p.kind === "drums"
          ? null
          : p.events.find(
              (e) =>
                beat >= e.beat &&
                beat < e.beat + e.beats - (p.kind === "chords" ? 0.05 : 0),
            );
      this.playNote(note, now);
      if (p.kind === "drums") this.strike(p.events, beat);
    }
    const bridge = p.learner && PRACTICE_BREAKS.find((b) => b.after === p.id);
    const endBeat = p.beats + (bridge?.beats || 0);
    if (beat >= p.beats && !this.ending) {
      this.guide = null;
      this.host.cues?.reset();
      this.ending = true;
      this.playNote(null, now);
      this.a.park(this.a.virtuals[1]);
      for (const role of LOOPER_ROLES)
        if (!bridge && !this.a.get(role).transport.recording)
          this.a.get(role).stop();
      if (!bridge && !this.queue.length) this.a.get("metronome").pause();
    }
    if (beat >= p.beats + 0.5 && !this.phaseAssessed) {
      this.phaseAssessed = true;
      if (p.record) {
        const h = this.a.get(this.recordRole);
        if (
          h.transport.recording ||
          h.transport.recordArmed ||
          !h.timeline.hasRecording()
        ) {
          this.cancel(
            "No complete four-bar take. Start on beat 1 and continue through the recording window.",
          );
          return;
        }
        this.recordRole = null;
        this.attemptTake = null;
      }
      const result = assess(p.events, this.heard, this.anchor, this.timing);
      if (p.learner) {
        this.results[p.id] = result;
        if (this.isPracticeSection(p)) {
          this.lastProgress = this.practiceProgress.record(
            p.id,
            this.timing.bpm,
            result,
          );
          this.persist();
        }
        this.feedback = `${result.score}/100 · ${result.correct}/${result.total} gestures; ${result.landmarks} pitch landmarks. ${result.extra} extra gestures. ${result.failures[0]?.reason || "Matching pitches, bends and releases."} ${this.isPracticeSection(p) ? (this.lastProgress.passed ? `Passed at ${this.timing.bpm} BPM. Continue at ${this.lastProgress.next} BPM.` : `Retry at ${this.timing.bpm} BPM.`) : "Practice retries; Next Step continues."}`;
      }
      this.report = {
        step: p.id,
        bpm: this.timing.bpm,
        origin: p.learner ? "learner" : "demonstration",
        notes: this.heard.filter((e) => e.kind === "note").length,
        strikes: this.heard.filter((e) => e.kind === "strike").length,
        result,
        completed: true,
      };
      this.a.releaseVirtuals();
    }
    if (beat >= endBeat + (bridge ? 0 : 0.5)) {
      for (const role of LOOPER_ROLES) this.a.get(role)?.stop();
      if (!this.queue.length) this.a.get("metronome")?.pause();
      this.ending = false;
      this.next(now);
    }
  }
  afterFrame(now) {
    this.a.observe(now);
    const beat = this.phase ? (now - this.anchor) / this.timing.beatMs : null;
    const target = this.phase?.events.find(
      (e) => beat >= e.beat - 0.25 && beat < e.beat + e.beats,
    );
    // Shared timing cues own all timed phases, including held-bend targets.
    this.a.focus(null);
    this.updateLabels();
    if (this.dom) {
      const hidden = this.host.panel.xr;
      if (this.dom.hidden !== hidden) this.dom.hidden = hidden;
      // XR does not display this keyboard. On return to desktop, synchronize
      // the current action once; unchanged attributes need no DOM mutation.
      if (!hidden)
        for (const b of this.buttons) {
          if (b.disabled !== this.demonstrating)
            b.disabled = this.demonstrating;
          const active = String(b.dataset.role === target?.role);
          if (b.dataset.active !== active) b.dataset.active = active;
        }
    }
  }
  restoreSaved() {
    if (!this.saved) return;
    for (const [role, take] of Object.entries(this.saved))
      this.restore(role, take);
    this.saved = null;
  }
  finish() {
    this.guide = null;
    this.host.cues?.reset();
    this.a.releaseVirtuals();
    this.a.stopSound();
    this.a.setVirtualsActive(false);
    this.restoreSaved();
    if (this.full) {
      this.index = this.steps.length - 1;
      this.feedback =
        "Full demonstration complete. All loopers stopped on the final beat. Choose Previous Step to practice the parts.";
    } else if (this.report?.origin === "demonstration")
      this.feedback =
        "Example complete. Choose Practice to try this part yourself.";
    this.full = false;
    this.applyTempo();
  }
  cancel(message = "") {
    this.actionGeneration = (this.actionGeneration || 0) + 1;
    this.guide = null;
    this.host.cues?.reset();
    this.a.focus(null);
    this.queue = [];
    this.phase = null;
    this.ending = false;
    this.desktopRole = null;
    this.desktopStrike = null;
    this.a.releaseAll();
    this.a.stopSound();
    this.a.setVirtualsActive(false);
    this.note = null;
    if (this.recordRole && this.attemptTake)
      this.restore(this.recordRole, this.attemptTake);
    this.recordRole = null;
    this.attemptTake = null;
    this.restoreSaved();
    if (message) this.feedback = message;
  }
  model(now) {
    const p = this.phase || this.step,
      beat = this.phase ? (now - this.anchor) / this.timing.beatMs : null;
    const target = p.events.find(
      (e) => beat !== null && e.beat + e.beats > beat,
    );
    const sourceBeat = beat + (p.sourceStart || 0);
    const bridge =
      this.phase?.learner &&
      beat >= p.beats &&
      PRACTICE_BREAKS.find((b) => b.after === p.id);
    const rest =
      ["melody", "performance"].includes(p.kind) && beat !== null
        ? [40, 88].find(
            (start) => sourceBeat >= start && sourceBeat < start + 8,
          )
        : undefined;
    this.host.panel.setTransport(
      beat === null
        ? `${this.selectedBpm()} BPM · 4/4`
        : beat < -4
          ? "Ready for count-in…"
          : beat < 0
            ? `Count in: ${Math.ceil(-beat)}`
            : bridge
              ? `${bridge.kind === "practice-only" ? "Practice-only bridge" : "Interlude"} · ${Math.max(0, Math.ceil(p.beats + bridge.beats - beat))} beats remaining · Next: ${bridge.next}`
              : rest !== undefined
                ? `Interlude · ${Math.floor(sourceBeat - rest) + 1} / 8 beats`
                : `Beat ${Math.min(p.beats, Math.floor(beat) + 1)} / ${p.beats}${target ? " · " + (target.midi ? gestureInstruction(target) : target.sound || target.role) : ""}`,
    );
    const button = (id, label, disabled = false) => ({ id, label, disabled });
    return {
      visible: true,
      title: p.title,
      instruction:
        p.instruction +
        (this.host.cues?.bendInstruction
          ? "\n" + this.host.cues.bendInstruction
          : ""),
      progress: `KUCH · ${this.arrangement.title} · ${this.steps.findIndex((s) => s.id === p.id) + 1}/${this.steps.length}${this.phase ? (this.phase.learner ? " · Practice" : " · Demonstration") : ""}`,
      feedback:
        this.feedback +
        (this.isPracticeSection(p)
          ? "\n" +
            this.practiceProgress.describe(
              p.id,
              this.phase ? this.timing.bpm : this.selectedBpm(),
            )
          : ""),
      practiceTempo: this.isPracticeSection()
        ? {
            bpm: this.a.get("metronome").bpm,
            progressive: this.practiceProgress.enabled,
            disabled: Boolean(this.r.capture?.active),
          }
        : null,
      navigation: [
        button(
          "previous-step",
          "Previous Step",
          this.index === 0 || this.running,
        ),
        button(
          "next-step",
          "Next Step",
          this.index === this.steps.length - 1 || this.running,
        ),
        button(
          "step-demo",
          this.demonstrating ? "Stop Example" : "Demonstrate",
          Boolean(this.phase?.learner),
        ),
        button(
          "step-practice",
          this.phase?.learner
            ? "Stop Practice"
            : this.isPracticeSection()
              ? "Start Practice"
              : "Practice",
          this.demonstrating,
        ),
      ],
      actions: [
        ...(p.kind === "switch"
          ? [
              button(
                "play-alternativeLooper",
                "Play Change",
                !this.phase?.learner,
              ),
              button("play-chordLooper", "Play D", !this.phase?.learner),
            ]
          : [
              button(
                "kuch-quick-practice",
                "Practice full song — backing ready",
                this.running,
              ),
            ]),
        button("recenter", "Recenter"),
        button("exit", "Exit"),
      ],
    };
  }
  dispose() {
    this.disposed = true;
    this.unsubscribeRegistry?.();
    this.cancel();
    window.removeEventListener("blur", this.blur);
    this.dom?.remove();
    const metro = this.a.get("metronome");
    if (metro && this.originalSetBpm) metro.setBpm = this.originalSetBpm;
    restoreKuchBacking(this.a, this.backingSnapshots);
    super.dispose();
  }
}
