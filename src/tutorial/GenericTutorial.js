import { DataEnsemble, DataGuidance } from "../compositions/DataEnsemble.js";

// Data-driven runner for imported compositions. The score is shared by demo,
// assessment and recording; only learner-origin observations earn credit.
export class GenericTutorial {
  constructor(host, definition) {
    this.host = host;
    this.a = host.adapter;
    this.r = host.r;
    this.definition = definition;
    this.ensemble = new DataEnsemble(host, definition);
    this.index = 0;
    this.outcomes = {};
    this.heard = [];
    const progress = host.learningProgress.load(
      definition.id,
      definition.contentVersion,
    );
    if (progress) {
      this.index = Math.min(definition.lessons.length - 1, progress.index || 0);
      this.outcomes = progress.outcomes || {};
    }
    this.feedback =
      "Review setup and roles, then Demonstrate or Practice. Next skips without mastery.";
  }
  get step() {
    return this.definition.lessons[this.index];
  }
  prepare() {
    this.ensemble.prepare();
  }
  accept(e) {
    if (
      this.phase === "practice" &&
      e.origin === "learner" &&
      e.startMs >= this.anchor
    )
      this.heard.push(e);
  }
  cancel() {
    this.ensemble.cancel();
    this.a.setVirtualsActive(false);
    this.phase = null;
    this.a.focus(null);
  }
  async action(id) {
    if (id === "exit") {
      this.cancel();
      return this.host.enterPlay();
    }
    if (id === "previous-step" || id === "next-step") {
      this.cancel();
      this.outcomes[this.step.id] ||= "skipped";
      this.index = Math.max(
        0,
        Math.min(
          this.definition.lessons.length - 1,
          this.index + (id === "next-step" ? 1 : -1),
        ),
      );
      this.persist();
    } else if (id === "step-demo" || id === "step-practice") {
      this.cancel();
      await this.r.audioSystem.ensureAudio();
      this.ensemble.validate();
      this.phase = id === "step-demo" ? "demo" : "practice";
      this.heard = [];
      const now = performance.now(),
        audio = this.r.audioSystem.audioContextService.context;
      this.anchor = now + (4 * 60000) / this.definition.bpm;
      this.last = now;
      this.origin = this.anchor - this.step.startSeconds * 1000;
      this.guide = new DataGuidance(this.definition, this.origin);
      this.ensemble.schedule({
        countAt: now,
        beatZero: this.origin,
        wallNow: now,
        audioNow: audio.currentTime,
      });
      this.a.setVirtualsActive(this.phase === "demo", "demonstration");
      this.feedback =
        this.phase === "demo"
          ? "Watch the actual instruments. Demonstrations preserve your takes and earn no credit."
          : "Practice: follow the count-in and target. Next skips; Practice retries.";
    }
  }
  update(now) {
    if (!this.phase) return;
    if (
      now - this.last > 250 ||
      this.r.audioSystem.audioContextService.context?.state !== "running"
    ) {
      this.cancel();
      this.feedback = "Interrupted. Practice again for a fresh count-in.";
      return;
    }
    this.last = now;
    this.ensemble.update(now);
    const time = (now - this.origin) / 1000;
    if (this.phase === "demo") {
      const event =
        now < this.anchor
          ? null
          : this.definition.score.events.find(
              (e) =>
                this.step.eventIds.includes(e.id) &&
                time >= e.startSeconds &&
                time < e.startSeconds + e.durationSeconds,
            );
      if (event?.id !== this.note) {
        this.a.squeeze(null, false, 0, now);
        this.r.updateHorn(now);
        this.a.observe(now);
        this.note = event?.id;
      }
      if (event) {
        const curve = event.bend || [],
          offset = time - event.startSeconds;
        let value = 0;
        for (const p of curve) {
          if (p.seconds > offset) break;
          value = p.semitones;
        }
        this.a.squeeze(event.role, true, value, now);
      }
    }
    if (time >= this.step.endSeconds + 0.4) {
      const learner = this.phase === "practice";
      this.a.observe(now);
      this.cancel();
      if (learner) {
        const result = assessDataLesson(
          this.definition,
          this.step,
          this.heard,
          this.origin,
        );
        this.outcomes[this.step.id] = result.ok ? "passed" : "retry";
        this.feedback = `${result.correct}/${result.total} matched · ${result.extra} extra. ${result.ok ? this.step.success : this.step.retry}`;
        this.persist();
      } else
        this.feedback = "Example complete. Practice to try the same score.";
    }
  }
  persist() {
    try {
      globalThis.localStorage?.setItem(
        `honk-orchestra:progress:${this.definition.id}:${this.definition.contentVersion}`,
        JSON.stringify({ index: this.index, outcomes: this.outcomes }),
      );
    } catch {
      /* separate from Play */
    }
  }
  model(now) {
    const b = (id, label, disabled = false) => ({ id, label, disabled });
    const guide = this.phase ? this.guide.model(now) : {};
    if (this.phase && now < this.anchor)
      guide.transport = `Count in: ${Math.ceil((this.anchor - now) / (60000 / this.definition.bpm))}`;
    this.host.panel.setTransport(guide.transport || "");
    return {
      visible: true,
      title: this.step.title,
      instruction: `${this.step.setup}\n${guide.instruction || this.step.goal}`,
      feedback: this.feedback,
      progress: `${this.definition.title} · ${this.index + 1}/${this.definition.lessons.length}`,
      navigation: [
        b("previous-step", "Previous", this.index === 0),
        b(
          "next-step",
          "Next / Skip",
          this.index === this.definition.lessons.length - 1,
        ),
        b("step-demo", "Demonstrate"),
        b("step-practice", "Practice / Retry"),
      ],
      actions: [b("recenter", "Recenter"), b("exit", "Exit")],
    };
  }
  dispose() {
    this.cancel();
  }
}
export function assessDataLesson(definition, lesson, heard, origin) {
  const remaining = heard.filter(
      (e) => e.origin === "learner" && ["note", "strike"].includes(e.kind),
    ),
    tolerance = lesson.assessment;
  const events = definition.score.events.filter((e) =>
    lesson.eventIds.includes(e.id),
  );
  let correct = 0;
  for (const event of events) {
    const index = remaining.findIndex(
      (e) =>
        e.released &&
        e.voiced &&
        !e.invalidMembers &&
        e.midis?.length === 1 &&
        Math.abs(e.midis[0] - event.midi) * 100 <= tolerance.pitchCents &&
        Math.abs((e.startMs - origin) / 1000 - event.startSeconds) <=
          tolerance.onsetSeconds &&
        Math.abs((e.endMs - e.startMs) / 1000 - event.durationSeconds) <=
          tolerance.durationSeconds &&
        (event.bend || []).every(
          (p) =>
            Math.abs(
              (e.bendSamples?.reduce(
                (best, s) =>
                  Math.abs(s.offsetMs / 1000 - p.seconds) <
                  Math.abs(best.offsetMs / 1000 - p.seconds)
                    ? s
                    : best,
                { offsetMs: Infinity, semitones: 0 },
              ).semitones || 0) - p.semitones,
            ) *
              100 <=
            tolerance.bendCents,
        ),
    );
    if (index >= 0) {
      correct++;
      remaining.splice(index, 1);
    }
  }
  return {
    correct,
    total: events.length,
    extra: remaining.length,
    ok: correct === events.length && !remaining.length,
  };
}
