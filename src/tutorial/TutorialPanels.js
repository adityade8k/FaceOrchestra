import { libraryPage } from "../compositions/CompositionRegistry.js";

import { recordingGuidance } from "./recordingGuidance.js";

import { COMPOSITION as C, describeNote } from "../compositions/songs/jog/definition.js";
import { scoreForStep } from "./scoring.js";

import { setupStatus } from "./TutorialLessonPolicy.js";
import { visualCueTime } from "./GuidedPlayOffset.js";

export class TutorialPanels {
  constructor(host) {
    this.host = host;
  }
  render(now) {
    if (!this.host.panel || this.host.disposed) return;
    if (this.host.navigation.screen) {
      this.renderNavigation();
      return;
    }
    if (this.host.dataTutorial) {
      this.host.panel.render(this.host.dataTutorial.model(now));
      return;
    }
    if (this.host.basics && !this.host.basics.finale) {
      this.host.panel.render(this.host.basics.model());
      return;
    }
    if (this.host.recording.session) {
      if (!this.host.recording.session.guidance(now)) this.host.cues.reset();
      const model = this.host.recording.session.model(now);
      this.host.panel.setTransport(model.transport);
      this.host.panel.render(model);
      return;
    }
    const button = (id, label, disabled = false, extra = {}) => ({
      id,
      label,
      disabled,
      ...extra,
    });
    let model;
    if (!this.host.session) {
      if (this.host.screen === "launch")
        model = {
          title: "Honk Orchestra",
          instruction: "Play freely, or learn a piece with a guided tutorial.",
          actions: [
            button("play", "Play"),
            button("tutorials", "Tutorials"),
            button("record-songs", "Record Songs"),
          ],
        };
      else
        model = {
          title: "Free play",
          instruction:
            "Hold right A or left Y, roll to choose a category, then pull and roll to choose an item. Release to preview; Trigger places. Grip in empty space equips a stick.",
          actions: [button("tutorials", "Tutorials"), button("record-songs", "Record Songs")],
        };
      if (this.host.uiFeedback) model.feedback = this.host.uiFeedback;
      this.host.panel.setTransport("");
    } else {
      const s = this.host.session,
        simulation = s.mode === "simulation",
        step = s.step,
        shown = this.host.demo?.session || s;
      const activeDemo = Boolean(this.host.demo),
        activePractice = s.phase === "practicing";
      const snapshot = this.host.adapter.snapshot(now),
        setup = step && setupStatus(step, snapshot);
      const reason = s.complete
        ? "The study is complete."
        : simulation
          ? ""
          : this.host.flow.unavailable();
      const finale = this.host.basics?.finale;
      const nextDisabled =
        simulation ||
        s.complete ||
        Boolean(setup && !setup.ok) ||
        Boolean(s.requireCompletion && s.outcomes.get(step?.id)?.status !== "passed");
      const navigation = [
        button("previous-step", "Previous Step", simulation || (s.index === 0 && !finale)),
        button(
          "next-step",
          finale && s.index === s.steps.length - 1 ? "Finish tutorial" : "Next Step",
          nextDisabled,
          {
            primary: !nextDisabled && s.phase === "results",
            reason: setup && !setup.ok ? setup.message : "",
          },
        ),
        button(
          "step-demo",
          "Demonstrate",
          s.complete || (!simulation && !activeDemo && (activePractice || Boolean(reason))),
          {
            active: simulation ? !this.host.conductor?.paused : activeDemo,
            primary: !reason && s.phase === "ready" && !s.demonstrated.has(step?.id),
            reason: activePractice ? "Press Practice to stop the attempt." : reason,
          },
        ),
        button(
          "step-practice",
          "Practice",
          simulation || s.complete || (!activePractice && (activeDemo || Boolean(reason))),
          {
            active: activePractice,
            primary:
              !reason && !activeDemo && (s.phase === "results" || s.demonstrated.has(step?.id)),
            reason: activeDemo ? "Press Demonstrate to stop the example." : reason,
          },
        ),
      ];
      let target = "";
      if (shown.step?.timed && shown.anchorMs !== null && (activeDemo || s.phase !== "results")) {
        const beat = shown.beatAt(now);
        const cueBeat = shown.beatAt(visualCueTime(this.host.r, now));
        if (beat < 0) target = "Count in: " + Math.ceil(-beat);
        else {
          target =
            "Beat " + Math.min(shown.step.beats, Math.floor(beat) + 1) + " / " + shown.step.beats;
          const note = scoreForStep(shown.step).find((e) => e.beat + (e.beats ?? 0.4) > cueBeat);
          if (note?.pitch) target += "\n" + describeNote(note);
          else if (note?.role)
            target +=
              "\n" +
              (C.backing.find((g) => g.role === note.role)?.label ||
                {
                  percussion: "Honk · boink",
                  metronome: "Metronome · wood",
                  percussionLooper: "Looper · hihat",
                }[note.role] ||
                note.role);
        }
      }
      if (shown.step?.type === "record") {
        const progress = this.host.adapter
          .get(shown.step.looperRole)
          ?.looperController.recording.getRecordingProgress(
            this.host.adapter.get(shown.step.looperRole),
            now,
          );
        target =
          recordingGuidance(progress, shown.anchorMs === null ? null : shown.beatAt(now)) || target;
      }
      if (this.host.cues.bendInstruction)
        target += (target ? "\n" : "") + this.host.cues.bendInstruction;
      if (shown.practiceGate && activePractice)
        target =
          shown.practiceGate.model(now).transport +
          (this.host.cues.bendInstruction ? "\n" + this.host.cues.bendInstruction : "");
      this.host.panel.setTransport(target);
      let feedback = simulation
        ? this.host.conductor?.paused
          ? "Simulation paused. Press Demonstrate to resume."
          : "Full simulation running. Press Demonstrate to pause."
        : setup?.message ||
          (activePractice && s.practiceGate?.feedback) ||
          this.host.uiFeedback ||
          s.feedback ||
          reason ||
          (finale
            ? "Watch Demonstrate, then complete Practice to continue."
            : "Demonstrate or Practice. Next Step skips this exercise.");
      if (!simulation && !activeDemo && !activePractice && reason && !setup) feedback = reason;
      if (
        s.result &&
        !activeDemo &&
        !setup &&
        reason !== "No recording yet; you can skip this.host step"
      ) {
        const result = s.result,
          names = {
            targets: "Targets",
            timing: "Onsets",
            holdRelease: "Hold/release",
            bend: "Bend",
          };
        feedback =
          (result.score === undefined
            ? result.ok
              ? "Completed"
              : "Try again"
            : result.score + "/100" + (result.ok ? " · Well played" : "")) + "\n";
        if (result.components)
          feedback +=
            Object.entries(result.components)
              .map(([key, value]) => names[key] + " " + value)
              .join(" · ") + "\n";
        feedback += result.message;
        const mismatch = result.details?.find(
          (d) => d.heard === "missing" || d.extra || d.correct === false,
        );
        const name = (role) =>
          C.backing.find((g) => g.role === role)?.label || role?.replace("melody-", "") || "rest";
        if (mismatch)
          feedback +=
            "\nExpected " + name(mismatch.expected) + "; heard " + name(mismatch.heard) + ".";
        else {
          const timing = result.details?.find(
            (d) => d.onsetErrorBeats > 0.12 || d.holdErrorBeats > 0.175,
          );
          if (timing)
            feedback += step.timed
              ? "\n" +
                name(timing.expected) +
                ": expected beat " +
                (timing.beat + 1).toFixed(1) +
                ", heard " +
                (timing.heardBeat + 1).toFixed(1) +
                "."
              : "\nExpected a " +
                Math.round(timing.expectedHold) +
                " ms hold; heard " +
                Math.round(timing.heardHold) +
                " ms.";
        }
        feedback += "\nPractice retries; Next Step continues.";
      }
      if (s.complete)
        feedback = simulation
          ? "Simulation complete in " +
            (this.host.report?.durationSeconds || 0).toFixed(1) +
            " seconds."
          : [...s.outcomes.values()].filter((o) => o.status === "passed").length +
            " completed · " +
            [...s.outcomes.values()].filter((o) => o.status === "skipped").length +
            " skipped.";
      model = {
        title: s.complete ? "Study complete" : step.title,
        instruction: s.complete
          ? "VIRAG 2 · A, B, A, C, B, D."
          : s.practiceGate && activePractice
            ? s.practiceGate.model(now).instruction
            : step.instruction,
        navigation,
        actions: [
          ...(step?.type === "switch"
            ? [
                button("play-alternativeLooper", "Play Alternative", !activePractice),
                button("play-chordLooper", "Play Chords", !activePractice),
              ]
            : []),
          ...(finale ? [button("restart-finale", "Restart finale")] : []),
          button("recenter", "Recenter"),
          button("exit", "Exit"),
        ],
        feedback,
        result: !activeDemo && s.phase === "results" ? (s.result?.ok ? "passed" : "retry") : null,
        progress:
          (finale
            ? "BASICS · FINALE"
            : simulation
              ? "Simulation"
              : activeDemo
                ? "Demonstration"
                : "Lesson") +
          " · " +
          Math.min(s.index + 1, s.steps.length) +
          "/" +
          s.steps.length +
          (activePractice ? " · Practice" : s.phase === "results" ? " · Results" : ""),
      };
    }
    this.host.panel.render({ visible: true, ...model });
  }
  renderNavigation() {
    const button = (id, label, disabled = false) => ({ id, label, disabled });
    if (this.host.navigation.screen === "guided-play-settings") {
      const value = this.host.guidedPlayOffset.milliseconds,
        running = this.host.guidedPlayRunning();
      this.host.panel.render({
        visible: true,
        title: "Guided Play Offset",
        instruction: `${value} ms early · range 0–1000 ms\nNote highlights, bend targets and timed instructions appear this.host much before the beat.`,
        feedback: running
          ? "Stop the current practice, demonstration or recording before changing the offset."
          : "Music, the count-in and scoring stay on the beat. Your actual bend and sustain feedback stay live. This setting is remembered for tutorials and guided play.",
        navigation: [
          button("guided-offset:-100", "−100 ms", running || value === 0),
          button("guided-offset:100", "+100 ms", running || value === 1000),
          button("guided-offset:-10", "−10 ms", running || value === 0),
          button("guided-offset:10", "+10 ms", running || value === 1000),
        ],
        actions: [
          button("guided-offset:reset", "Reset to 0 ms", running || value === 0),
          button("guided-offset-back", "Back"),
        ],
      });
      return;
    }
    const status = this.host.navigation.navigationStatus;
    if (status?.state === "loading") {
      this.host.panel.render({
        visible: true,
        title: "Loading composition…",
        instruction: "Preparing the selected composition.",
        actions: [button("back", "Back")],
      });
      return;
    }
    if (this.host.navigation.screen === "composition-options") {
      const selection = this.host.navigation.compositionOptions,
        module = selection?.module;
      const choice = module?.arrangements.find((a) => a.id === selection.arrangementId);
      this.host.panel.render({
        visible: true,
        title: module?.definition.title || "Loading composition…",
        progress: choice ? `ARRANGEMENT · ${choice.title}` : "",
        instruction: choice
          ? `${choice.description} Selection stays fixed throughout the session.`
          : "Loading song options.",
        feedback: this.host.navigation.optionsError || "",
        navigation:
          module?.arrangements.map((a) =>
            button(`arrangement:${a.id}`, `${a.id === choice?.id ? "✓ " : ""}${a.title}`),
          ) || [],
        actions: [
          button(
            "composition-start",
            selection?.library === "record-songs" ? "Prepare Recording" : "Start Tutorial",
            !module,
          ),
          ...(selection?.library === "tutorials" && selection?.id === "kuch-to-hua-hai"
            ? [button("composition-quick-practice", "Practice full song — backing ready", !module)]
            : []),
          button("back", "Back"),
          ...(this.host.navigation.optionsError ? [button("retry-options", "Retry")] : []),
        ],
      });
      return;
    }
    const error = status?.state === "error" ? this.host.uiFeedback || status.error.message : "";
    if (this.host.navigation.screen === "launch") {
      this.host.panel.render({
        visible: true,
        title: "Honk Orchestra",
        instruction: "Play freely, learn an instrument or composition, or record a song.",
        feedback: error,
        actions: [
          button("play", "Play"),
          button("tutorials", "Tutorials"),
          button("record-songs", "Record Songs"),
        ],
      });
      return;
    }
    const page = libraryPage(
      this.host.navigation.catalog,
      this.host.navigation.screen,
      this.host.navigation.libraryPage,
    );
    this.host.navigation.libraryPage = page.index;
    this.host.panel.render({
      visible: true,
      title: this.host.navigation.screen === "tutorials" ? "Tutorials" : "Record Songs",
      instruction:
        this.host.navigation.screen === "tutorials"
          ? "Start with Basics, then learn a complete composition."
          : "Prepare the selected song. Pair the desktop receiver first; use Open Editor on the desktop to edit takes.",
      feedback: error,
      progress: `LIBRARY · ${page.index + 1}/${page.pages}`,
      navigation: [
        ...page.rows.map((row) =>
          button(row.id === "basics" ? "basics" : `composition:${row.id}`, row.title),
        ),
        button("library-prev", "Previous", page.index === 0),
        button("library-next", "Next", page.index + 1 === page.pages),
      ],
      actions: [
        button("back", "Back"),
        button(error ? "retry-load" : "resume-mode", error ? "Retry" : "Current session"),
        button("guided-play-settings", "Guided Play Offset"),
      ],
    });
  }
}
